import {
  MAX_PHOTO_BYTES,
  CONTACT_FIELDS,
  contactInputSchema,
  formDataToValues,
  photoFileToDataUrl,
  photoFileValidationError,
  photoValidationError,
  zodAddressErrors,
  zodFieldErrors,
} from "@/lib/contacts/schema";

const PHOTO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const LOSSLESS_WEBP_BASE64 =
  "UklGRhwAAABXRUJQVlA4TA8AAAAvAAAAAAcQ/Y/+ByKi/wEA";
const EXTENDED_WEBP_BASE64 =
  "UklGRlgAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAIAAAAAgFZQOCAwAAAA0AEAnQEqAQABAAFAJiWgAnS6AfgAA7AA/vLrf/zYFc1z7/f/0uD9Lg/S4P/SkAAA";
const ANIMATED_WEBP_BASE64 =
  "UklGRoQAAABXRUJQVlA4WAoAAAACAAAAAAAAAAAAQU5JTQYAAAAAAAAAAABBTk1GKAAAAAAAAAAAAAAAAAAAAGQAAAJWUDhMDwAAAC8AAAAABxD9j/4HIqL/AQBBTk1GKAAAAAAAAAAAAAAAAAAAAGQAAABWUDhMDwAAAC8AAAAAB9D/iP4HIqL/AQA=";
const PROGRESSIVE_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUAQEAAAAAAAAAAAAAAAAAAAAF/9oADAMBAAIQAxAAAAGcMFf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEAv/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==";

function values(overrides: Record<string, string> = {}) {
  return {
    first_name: "Ada",
    last_name: "Lovelace",
    email: "Ada@Example.com",
    photo: "",
    phone: "",
    company: "",
    job_title: "",
    addresses: "[]",
    notes: "",
    ...overrides,
  };
}

describe("contactInputSchema", () => {
  it("lowercases the email and nulls out the blanks", () => {
    const parsed = contactInputSchema.parse(values());

    expect(parsed.email).toBe("ada@example.com");
    expect(parsed.phone).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("trims what the user typed", () => {
    expect(contactInputSchema.parse(values({ company: "  Acme  " })).company).toBe(
      "Acme",
    );
  });

  it("validates and normalizes multiple addresses", () => {
    const parsed = contactInputSchema.parse(
      values({
        addresses: JSON.stringify([
          {
            type: "Home",
            address: " 12 Home St ",
            city: " Oakland ",
            state: "",
            postal_code: "",
            country: " USA ",
          },
          {
            type: "Work",
            address: "1 Market St",
            city: "San Francisco",
            state: "CA",
            postal_code: "94105",
            country: "USA",
          },
        ]),
      }),
    );

    expect(parsed.addresses).toEqual([
      {
        type: "Home",
        address: "12 Home St",
        city: "Oakland",
        state: null,
        postal_code: null,
        country: "USA",
      },
      {
        type: "Work",
        address: "1 Market St",
        city: "San Francisco",
        state: "CA",
        postal_code: "94105",
        country: "USA",
      },
    ]);
  });

  it("reports errors against the exact address row", () => {
    const result = contactInputSchema.safeParse(
      values({
        addresses: JSON.stringify([
          {
            type: "Home",
            address: "",
            city: "",
            state: "",
            postal_code: "",
            country: "",
          },
        ]),
      }),
    );

    expect(zodAddressErrors(result.error!)).toEqual({
      0: { address: "Street address is required" },
    });
  });

  it("accepts a supported photo data URL", () => {
    const photo = `data:image/png;base64,${PHOTO_BASE64}`;
    expect(contactInputSchema.parse(values({ photo })).photo).toBe(photo);
  });

  it("rejects a mismatched or oversized photo", () => {
    const mismatch = contactInputSchema.safeParse(
      values({ photo: "data:image/png;base64,aGVsbG8=" }),
    );
    expect(zodFieldErrors(mismatch.error!).photo).toMatch(/does not match/i);

    const encodedLength = Math.ceil((MAX_PHOTO_BYTES + 1) / 3) * 4;
    const oversizedBase64 = "iVBORw0KGgoA".padEnd(encodedLength, "A");
    const oversized =
      "data:image/png;base64," + oversizedBase64;
    const tooLarge = contactInputSchema.safeParse(values({ photo: oversized }));
    expect(zodFieldErrors(tooLarge.error!).photo).toBe(
      "Photo must be 2 MB or smaller",
    );
  });

  it("rejects truncated image payloads", () => {
    expect(photoValidationError("data:image/jpeg;base64,/9j/")).toMatch(
      /does not match/i,
    );
  });

  it("accepts one-pixel lossless, extended, and animated WebP images", () => {
    expect(
      photoValidationError(`data:image/webp;base64,${LOSSLESS_WEBP_BASE64}`),
    ).toBeNull();
    expect(
      photoValidationError(`data:image/webp;base64,${EXTENDED_WEBP_BASE64}`),
    ).toBeNull();
    expect(
      photoValidationError(`data:image/webp;base64,${ANIMATED_WEBP_BASE64}`),
    ).toBeNull();
  });

  it("accepts progressive JPEG images", () => {
    expect(
      photoValidationError(`data:image/jpeg;base64,${PROGRESSIVE_JPEG_BASE64}`),
    ).toBeNull();
  });

  it("requires the three fields the API requires", () => {
    const result = contactInputSchema.safeParse(
      values({ first_name: " ", last_name: "", email: "" }),
    );

    expect(result.success).toBe(false);
    expect(zodFieldErrors(result.error!)).toEqual({
      first_name: "First name is required",
      last_name: "Last name is required",
      email: "Email is required",
    });
  });

  it("rejects a malformed email", () => {
    const result = contactInputSchema.safeParse(values({ email: "not-an-email" }));
    expect(zodFieldErrors(result.error!).email).toBe("Enter a valid email address");
  });

  it("enforces the API's length limits", () => {
    const result = contactInputSchema.safeParse(
      values({
        first_name: "a".repeat(101),
        addresses: JSON.stringify([
          {
            type: "Home",
            address: "12 Home St",
            city: "",
            state: "",
            postal_code: "9".repeat(21),
            country: "",
          },
        ]),
      }),
    );

    expect(zodFieldErrors(result.error!).first_name).toBe(
      "First name must be 100 characters or fewer",
    );
    expect(zodAddressErrors(result.error!)).toEqual({
      0: {
        postal_code: "Postal code must be 20 characters or fewer",
      },
    });
  });
});

describe("formDataToValues", () => {
  it("pulls every known field out, defaulting to an empty string", () => {
    const formData = new FormData();
    formData.set("first_name", "Grace");
    formData.set("email", "grace@example.com");
    formData.set("ignored", "nope");

    const extracted = formDataToValues(formData);

    expect(extracted.first_name).toBe("Grace");
    expect(extracted.last_name).toBe("");
    expect(extracted.photo).toBe("");
    expect(extracted.addresses).toBe("");
    expect(Object.keys(extracted).sort()).toEqual(
      [...CONTACT_FIELDS.map((field) => field.name), "photo", "addresses"].sort(),
    );
  });

  it("keeps native files out of raw string extraction", () => {
    const bytes = Uint8Array.from(atob(PHOTO_BASE64), (character) =>
      character.charCodeAt(0),
    );
    const formData = new FormData();
    formData.set("photo", "existing-photo");
    formData.set(
      "photo_file",
      new File([bytes], "avatar.png", { type: "image/png" }),
    );

    expect(formDataToValues(formData).photo).toBe("existing-photo");
  });
});

describe("photoFileToDataUrl", () => {
  it("converts a validated native photo file", async () => {
    const bytes = Uint8Array.from(atob(PHOTO_BASE64), (character) =>
      character.charCodeAt(0),
    );
    const file = new File([bytes], "avatar.png", { type: "image/png" });

    await expect(photoFileToDataUrl(file)).resolves.toBe(
      `data:image/png;base64,${PHOTO_BASE64}`,
    );
  });

  it("rejects unsupported or oversized files before reading them", async () => {
    const unsupported = new File(["<svg/>"], "avatar.svg", {
      type: "image/svg+xml",
    });
    const oversized = new File(
      [new Uint8Array(MAX_PHOTO_BYTES + 1)],
      "avatar.png",
      { type: "image/png" },
    );
    const unsupportedRead = jest.spyOn(unsupported, "arrayBuffer");
    const oversizedRead = jest.spyOn(oversized, "arrayBuffer");

    expect(photoFileValidationError(unsupported)).toMatch(/Choose/i);
    expect(photoFileValidationError(oversized)).toBe(
      "Photo must be 2 MB or smaller",
    );
    await expect(photoFileToDataUrl(unsupported)).rejects.toThrow(/Choose/i);
    await expect(photoFileToDataUrl(oversized)).rejects.toThrow(/2 MB/i);
    expect(unsupportedRead).not.toHaveBeenCalled();
    expect(oversizedRead).not.toHaveBeenCalled();
  });
});
