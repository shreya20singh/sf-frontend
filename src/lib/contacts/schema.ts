import { z } from "zod";
import {
  ADDRESS_TYPES,
  type AddressFieldErrors,
  type AddressInput,
  type ContactFieldName,
  type ContactFormFieldName,
  type ContactInput,
} from "./types";

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const PHOTO_FILE_FIELD = "photo_file";

const PHOTO_DATA_URL_PATTERN =
  /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/;

function startsWithBytes(
  bytes: Uint8Array,
  offset: number,
  expected: number[],
): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] +
    (bytes[offset + 1] << 8) +
    (bytes[offset + 2] << 16) +
    bytes[offset + 3] * 0x1000000
  );
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function hasPngStructure(bytes: Uint8Array): boolean {
  if (
    bytes.length < 33 ||
    !startsWithBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return false;
  }

  let offset = 8;
  let sawHeader = false;
  let sawImageData = false;

  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const dataStart = offset + 8;
    const chunkEnd = dataStart + length + 4;
    if (chunkEnd > bytes.length) return false;

    const type = readAscii(bytes, offset + 4, 4);
    if (type === "IHDR") {
      if (
        sawHeader ||
        offset !== 8 ||
        length !== 13 ||
        readUint32BE(bytes, dataStart) === 0 ||
        readUint32BE(bytes, dataStart + 4) === 0
      ) {
        return false;
      }
      sawHeader = true;
    } else if (type === "IDAT") {
      if (!sawHeader || length === 0) return false;
      sawImageData = true;
    } else if (type === "IEND") {
      return sawHeader && sawImageData && length === 0 && chunkEnd === bytes.length;
    }

    offset = chunkEnd;
  }

  return false;
}

function hasJpegStructure(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || !startsWithBytes(bytes, 0, [0xff, 0xd8])) {
    return false;
  }

  let offset = 2;
  let sawFrame = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return false;

    const marker = bytes[offset++];
    if (marker === 0x00 || marker === 0xd9) return false;

    if (marker === 0xda) {
      if (offset + 2 > bytes.length) return false;
      const segmentLength = readUint16BE(bytes, offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) {
        return false;
      }
      offset += segmentLength;

      let sawScanData = false;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          sawScanData = true;
          offset += 1;
          continue;
        }

        while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
        if (offset >= bytes.length) return false;

        const scanMarker = bytes[offset];
        if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) {
          sawScanData = true;
          offset += 1;
          continue;
        }
        if (scanMarker === 0xd9) {
          return sawFrame && sawScanData && offset + 1 === bytes.length;
        }
        return false;
      }
      return false;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return false;

    const segmentLength = readUint16BE(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return false;
    }

    const isFrameMarker =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrameMarker) {
      if (segmentLength < 7) return false;
      const frameData = offset + 2;
      if (
        readUint16BE(bytes, frameData + 1) === 0 ||
        readUint16BE(bytes, frameData + 3) === 0
      ) {
        return false;
      }
      sawFrame = true;
    }

    offset += segmentLength;
  }

  return false;
}

function skipGifSubBlocks(bytes: Uint8Array, offset: number): number | null {
  while (offset < bytes.length) {
    const length = bytes[offset++];
    if (length === 0) return offset;
    if (offset + length > bytes.length) return null;
    offset += length;
  }
  return null;
}

function hasGifStructure(bytes: Uint8Array): boolean {
  if (
    bytes.length < 14 ||
    (readAscii(bytes, 0, 6) !== "GIF87a" &&
      readAscii(bytes, 0, 6) !== "GIF89a") ||
    readUint16LE(bytes, 6) === 0 ||
    readUint16LE(bytes, 8) === 0
  ) {
    return false;
  }

  let offset = 13;
  const screenPacked = bytes[10];
  if (screenPacked & 0x80) {
    const tableLength = 3 * 2 ** ((screenPacked & 0x07) + 1);
    if (offset + tableLength > bytes.length) return false;
    offset += tableLength;
  }

  let sawImage = false;
  while (offset < bytes.length) {
    const blockType = bytes[offset++];
    if (blockType === 0x3b) {
      return sawImage && offset === bytes.length;
    }

    if (blockType === 0x21) {
      if (offset >= bytes.length) return false;
      offset += 1;
      const nextOffset = skipGifSubBlocks(bytes, offset);
      if (nextOffset === null) return false;
      offset = nextOffset;
      continue;
    }

    if (blockType !== 0x2c || offset + 9 > bytes.length) return false;
    if (readUint16LE(bytes, offset + 4) === 0 || readUint16LE(bytes, offset + 6) === 0) {
      return false;
    }

    const imagePacked = bytes[offset + 8];
    offset += 9;
    if (imagePacked & 0x80) {
      const tableLength = 3 * 2 ** ((imagePacked & 0x07) + 1);
      if (offset + tableLength > bytes.length) return false;
      offset += tableLength;
    }

    if (offset >= bytes.length) return false;
    const minimumCodeSize = bytes[offset++];
    if (minimumCodeSize < 2 || minimumCodeSize > 8) return false;
    const imageDataStart = offset;
    const nextOffset = skipGifSubBlocks(bytes, offset);
    if (nextOffset === null || nextOffset === imageDataStart) return false;
    offset = nextOffset;
    sawImage = true;
  }

  return false;
}

function hasWebpStructure(bytes: Uint8Array): boolean {
  if (
    bytes.length < 20 ||
    readAscii(bytes, 0, 4) !== "RIFF" ||
    readUint32LE(bytes, 4) !== bytes.length - 8 ||
    readAscii(bytes, 8, 4) !== "WEBP"
  ) {
    return false;
  }

  let offset = 12;
  let sawImage = false;

  while (offset + 8 <= bytes.length) {
    const type = readAscii(bytes, offset, 4);
    const length = readUint32LE(bytes, offset + 4);
    const dataStart = offset + 8;
    const paddedLength = length + (length & 1);
    if (paddedLength > bytes.length - dataStart) return false;

    if (type === "VP8 ") {
      if (
        length < 10 ||
        !startsWithBytes(bytes, dataStart + 3, [0x9d, 0x01, 0x2a]) ||
        (readUint16LE(bytes, dataStart + 6) & 0x3fff) === 0 ||
        (readUint16LE(bytes, dataStart + 8) & 0x3fff) === 0
      ) {
        return false;
      }
      sawImage = true;
    } else if (type === "VP8L") {
      if (length < 5 || bytes[dataStart] !== 0x2f) return false;
      const dimensions =
        bytes[dataStart + 1] |
        (bytes[dataStart + 2] << 8) |
        (bytes[dataStart + 3] << 16) |
        (bytes[dataStart + 4] << 24);
      if ((dimensions & 0x3fff) === 0 || ((dimensions >>> 14) & 0x3fff) === 0) {
        return false;
      }
      sawImage = true;
    } else if (type === "VP8X") {
      if (length < 10) return false;
      const width =
        bytes[dataStart + 4] |
        (bytes[dataStart + 5] << 8) |
        (bytes[dataStart + 6] << 16);
      const height =
        bytes[dataStart + 7] |
        (bytes[dataStart + 8] << 8) |
        (bytes[dataStart + 9] << 16);
      if (width === 0 || height === 0) return false;
    }

    offset = dataStart + paddedLength;
  }

  return sawImage && offset === bytes.length;
}

function hasImageStructure(
  mediaType: string,
  bytes: Uint8Array,
): boolean {
  switch (mediaType) {
    case "image/jpeg":
      return hasJpegStructure(bytes);
    case "image/png":
      return hasPngStructure(bytes);
    case "image/gif":
      return hasGifStructure(bytes);
    case "image/webp":
      return hasWebpStructure(bytes);
    default:
      return false;
  }
}

export function photoValidationError(value: string): string | null {
  if (!value) return null;

  const match = PHOTO_DATA_URL_PATTERN.exec(value);
  if (!match || match[2].length % 4 !== 0) {
    return "Choose a JPG, PNG, WebP, or GIF image";
  }

  const [, mediaType, encoded] = match;
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const byteLength = (encoded.length * 3) / 4 - padding;
  if (byteLength > MAX_PHOTO_BYTES) return "Photo must be 2 MB or smaller";

  let bytes: Uint8Array;
  try {
    const binary = atob(encoded);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return "Photo contains invalid base64 data";
  }
  return hasImageStructure(mediaType, bytes)
    ? null
    : "Photo content does not match its declared image type";
}

export async function photoFileToDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${file.type};base64,${btoa(binary)}`;
}

/**
 * Client/server-shared validation for the contact form.
 *
 * The rules mirror the API's Pydantic models (`ContactCreate` / `ContactReplace`)
 * so the user sees a mistake before a round trip — the API stays the authority,
 * and anything it rejects anyway is surfaced by `toFieldErrors` in `./api.ts`.
 */

/** Optional text: trimmed, and blank becomes `null` (the API clears the field). */
function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .transform((value) => value || null)
    .nullable()
    .default(null);
}

function requiredText(max: number, label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);
}

export const addressInputSchema = z.object({
  type: z.enum(ADDRESS_TYPES),
  address: requiredText(300, "Street address"),
  city: optionalText(120, "City"),
  state: optionalText(120, "State"),
  postal_code: optionalText(20, "Postal code"),
  country: optionalText(120, "Country"),
}) satisfies z.ZodType<AddressInput, unknown>;

const addressesSchema = z
  .string()
  .transform((value, context): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Addresses could not be read",
      });
      return z.NEVER;
    }
  })
  .pipe(z.array(addressInputSchema));

export const contactInputSchema = z.object({
  first_name: requiredText(100, "First name"),
  last_name: requiredText(100, "Last name"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(320, "Email must be 320 characters or fewer")
    .pipe(z.email("Enter a valid email address"))
    .transform((value) => value.toLowerCase()),
  photo: z
    .string()
    .superRefine((value, context) => {
      const message = photoValidationError(value);
      if (message) context.addIssue({ code: "custom", message });
    })
    .transform((value) => value || null),
  phone: optionalText(40, "Phone"),
  company: optionalText(200, "Company"),
  job_title: optionalText(200, "Job title"),
  addresses: addressesSchema,
  notes: z
    .string()
    .trim()
    .transform((value) => value || null)
    .nullable()
    .default(null),
}) satisfies z.ZodType<ContactInput, unknown>;

export type ContactFormValues = z.input<typeof contactInputSchema>;

/** Collapse a ZodError into one message per field, keyed by input name. */
export function zodFieldErrors(
  error: z.ZodError,
): Partial<Record<ContactFormFieldName, string>> {
  const fieldErrors: Partial<Record<ContactFormFieldName, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) {
      fieldErrors[key as ContactFormFieldName] = issue.message;
    }
  }
  return fieldErrors;
}

export function zodAddressErrors(
  error: z.ZodError,
): Record<number, AddressFieldErrors> {
  const errors: Record<number, AddressFieldErrors> = {};

  for (const issue of error.issues) {
    const [collection, index, field] = issue.path;
    if (
      collection === "addresses" &&
      typeof index === "number" &&
      typeof field === "string"
    ) {
      errors[index] ??= {};
      errors[index][field as keyof AddressInput] ??= issue.message;
    }
  }

  return errors;
}

/* ------------------------------------------------------------------ */
/* Form metadata — one source of truth for the fields and their limits */
/* ------------------------------------------------------------------ */

export interface ContactFieldSpec {
  name: ContactFieldName;
  label: string;
  type?: "text" | "email" | "tel" | "textarea";
  required?: boolean;
  maxLength: number;
  placeholder?: string;
  autoComplete?: string;
  /** Column span inside the section grid. */
  wide?: boolean;
}

export interface ContactFieldGroup {
  title: string;
  description: string;
  fields: ContactFieldSpec[];
}

export const CONTACT_FIELD_GROUPS: ContactFieldGroup[] = [
  {
    title: "Identity",
    description: "First name, last name, and email are required.",
    fields: [
      {
        name: "first_name",
        label: "First name",
        required: true,
        maxLength: 100,
        placeholder: "Ada",
        autoComplete: "given-name",
      },
      {
        name: "last_name",
        label: "Last name",
        required: true,
        maxLength: 100,
        placeholder: "Lovelace",
        autoComplete: "family-name",
      },
      {
        name: "email",
        label: "Email",
        type: "email",
        required: true,
        maxLength: 320,
        placeholder: "ada@example.com",
        autoComplete: "email",
      },
      {
        name: "phone",
        label: "Phone",
        type: "tel",
        maxLength: 40,
        placeholder: "+1-415-555-0101",
        autoComplete: "tel",
      },
    ],
  },
  {
    title: "Work",
    description: "Where they work and what they do.",
    fields: [
      {
        name: "company",
        label: "Company",
        maxLength: 200,
        placeholder: "Analytical Engines",
        autoComplete: "organization",
      },
      {
        name: "job_title",
        label: "Job title",
        maxLength: 200,
        placeholder: "Mathematician",
        autoComplete: "organization-title",
      },
    ],
  },
  {
    title: "Notes",
    description: "Anything worth remembering. No length limit.",
    fields: [
      {
        name: "notes",
        label: "Notes",
        type: "textarea",
        maxLength: 10_000,
        placeholder: "Met at the SF hackathon.",
        wide: true,
      },
    ],
  },
];

export const CONTACT_FIELDS: ContactFieldSpec[] = CONTACT_FIELD_GROUPS.flatMap(
  (group) => group.fields,
);

/** Pull the contact fields out of a submitted form, as raw strings. */
export async function formDataToValues(
  formData: FormData,
): Promise<Record<ContactFormFieldName, string>> {
  const values = Object.fromEntries(
    [
      ...CONTACT_FIELDS.map((field) => field.name),
      "photo" as const,
      "addresses" as const,
    ].map((name) => [name, String(formData.get(name) ?? "")]),
  ) as Record<ContactFormFieldName, string>;

  const photoFile = formData.get(PHOTO_FILE_FIELD);
  if (photoFile && typeof photoFile !== "string" && photoFile.size > 0) {
    values.photo = await photoFileToDataUrl(photoFile);
  }

  return values;
}
