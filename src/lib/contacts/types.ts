/**
 * Types mirroring the Contacts API OpenAPI 3.1 document (`GET /openapi.json`).
 * Field names stay snake_case so payloads map 1:1 onto the wire format.
 */

export const ADDRESS_TYPES = ["Home", "Work", "Other"] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];

export interface AddressInput {
  type: AddressType;
  address: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface Address extends AddressInput {
  id: number;
}

/** `ContactRead` — a stored contact, as returned by every contact endpoint. */
export interface Contact {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  photo: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  addresses: Address[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  full_name: string;
}

/** `ContactListItem` — a collection item, which may omit the photo payload. */
export type ContactListItem = Omit<Contact, "photo"> & {
  photo?: string | null;
};

/** Every editable field, i.e. `ContactCreate` / `ContactReplace`. */
type ContactScalarInput = Omit<
  Contact,
  "id" | "addresses" | "created_at" | "updated_at" | "full_name"
>;

export type ContactInput = ContactScalarInput & {
  addresses: AddressInput[];
};

export type ContactFieldName = Exclude<keyof ContactInput, "addresses">;
export type ContactFormFieldName = ContactFieldName | "addresses";
export type AddressFieldErrors = Partial<
  Record<keyof AddressInput, string>
>;

/** `ContactPage` — one page of contacts plus the totals needed to paginate. */
export interface ContactPage {
  items: ContactListItem[];
  total: number;
  limit: number;
  offset: number;
}

/** `HealthResponse` — result of the liveness probe. */
export interface HealthResponse {
  status: string;
  database: string;
  contacts: number;
}

/** Sort fields the API's allow-list accepts. */
export const SORT_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "email",
  "company",
  "created_at",
  "updated_at",
] as const;

export type SortField = (typeof SORT_FIELDS)[number];
export type SortOrder = "asc" | "desc";

/** Bounds the API enforces on `limit`. */
export const MIN_LIMIT = 1;
export const MAX_LIMIT = 200;
export const DEFAULT_PER_PAGE = 25;
export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;

/**
 * Result of a server action, consumed by `useActionState` in the forms.
 * Lives here (not in the `"use server"` module) so client components can import
 * the type without pulling server code into the browser bundle.
 */
export type FormState = {
  status: "idle" | "error";
  /** Message shown above the form; used for API-level failures. */
  message?: string;
  /** Per-field messages keyed by input name. */
  fieldErrors?: Partial<Record<ContactFormFieldName, string>>;
  /** Nested messages keyed by the zero-based address row. */
  addressErrors?: Record<number, AddressFieldErrors>;
  /** Echo of the submitted values so the form survives a failed round trip. */
  values?: Partial<Record<ContactFormFieldName, string>>;
};

export const EMPTY_FORM_STATE: FormState = { status: "idle" };
