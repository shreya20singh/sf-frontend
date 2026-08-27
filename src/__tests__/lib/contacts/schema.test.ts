import {
  MAX_PHOTO_BYTES,
  CONTACT_FIELDS,
  contactInputSchema,
  formDataToValues,
  photoFileToDataUrl,
  photoValidationError,
  zodFieldErrors,
} from "@/lib/contacts/schema";

const PHOTO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function values(overrides: Record<string, string> = {}) {
  return {
    first_name: "Ada",
    last_name: "Lovelace",
    email: "Ada@Example.com",
    photo: "",
    phone: "",
    company: "",
    job_title: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
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
      values({ first_name: "a".repeat(101), postal_code: "9".repeat(21) }),
    );

    expect(zodFieldErrors(result.error!)).toEqual({
      first_name: "First name must be 100 characters or fewer",
      postal_code: "Postal code must be 20 characters or fewer",
    });
  });
});

describe("formDataToValues", () => {
  it("pulls every known field out, defaulting to an empty string", async () => {
    const formData = new FormData();
    formData.set("first_name", "Grace");
    formData.set("email", "grace@example.com");
    formData.set("ignored", "nope");

    const extracted = await formDataToValues(formData);

    expect(extracted.first_name).toBe("Grace");
    expect(extracted.last_name).toBe("");
    expect(extracted.photo).toBe("");
    expect(Object.keys(extracted).sort()).toEqual(
      [...CONTACT_FIELDS.map((field) => field.name), "photo"].sort(),
    );
  });

  it("converts a native photo file before schema validation", async () => {
    const bytes = Uint8Array.from(atob(PHOTO_BASE64), (character) =>
      character.charCodeAt(0),
    );
    const formData = new FormData();
    formData.set("photo", "existing-photo");
    formData.set(
      "photo_file",
      new File([bytes], "avatar.png", { type: "image/png" }),
    );

    await expect(formDataToValues(formData)).resolves.toMatchObject({
      photo: `data:image/png;base64,${PHOTO_BASE64}`,
    });
  });
});
