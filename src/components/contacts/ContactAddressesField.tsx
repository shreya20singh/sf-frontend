"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  ADDRESS_TYPES,
  type AddressFieldErrors,
  type AddressInput,
  type AddressType,
} from "@/lib/contacts/types";

type AddressFormValue = Record<keyof AddressInput, string>;
type AddressRow = {
  id: number;
  value: AddressFormValue;
};

const EMPTY_ADDRESS: AddressFormValue = {
  type: "Home",
  address: "",
  city: "",
  state: "",
  postal_code: "",
  country: "",
};

const EMPTY_ADDRESS_ERRORS: Record<number, AddressFieldErrors> = {};

function isAddressType(value: unknown): value is AddressType {
  return (
    typeof value === "string" &&
    (ADDRESS_TYPES as readonly string[]).includes(value)
  );
}

function toFormValue(address: AddressInput): AddressFormValue {
  return {
    type: address.type,
    address: address.address,
    city: address.city ?? "",
    state: address.state ?? "",
    postal_code: address.postal_code ?? "",
    country: address.country ?? "",
  };
}

function parseSubmittedAddresses(
  value: string | undefined,
  fallback: AddressInput[],
): AddressFormValue[] {
  if (value === undefined) return fallback.map(toFormValue);

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return fallback.map(toFormValue);
    return parsed.map((address) => ({
      type: isAddressType(address.type) ? address.type : "Home",
      address: String(address.address ?? ""),
      city: String(address.city ?? ""),
      state: String(address.state ?? ""),
      postal_code: String(address.postal_code ?? ""),
      country: String(address.country ?? ""),
    }));
  } catch {
    return fallback.map(toFormValue);
  }
}

const CONTROL =
  "w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-primary focus:bg-input";

function AddressField({
  index,
  name,
  label,
  value,
  error,
  maxLength,
  placeholder,
  onChange,
}: {
  index: number;
  name: Exclude<keyof AddressInput, "type">;
  label: string;
  value: string;
  error?: string;
  maxLength: number;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const id = `address-${index}-${name}`;
  const errorId = `${id}-error`;

  return (
    <div className={name === "address" ? "sm:col-span-2" : undefined}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-medium text-foreground"
      >
        {label}
        {name === "address" ? (
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
            optional
          </span>
        )}
      </label>
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        required={name === "address"}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`${CONTROL} ${error ? "border-destructive" : ""}`}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function ContactAddressesField({
  initialAddresses = [],
  submittedValue,
  error,
  addressErrors = EMPTY_ADDRESS_ERRORS,
}: {
  initialAddresses?: AddressInput[];
  submittedValue?: string;
  error?: string;
  addressErrors?: Record<number, AddressFieldErrors>;
}) {
  const nextRowId = useRef(0);
  const [addresses, setAddresses] = useState<AddressRow[]>(() =>
    parseSubmittedAddresses(submittedValue, initialAddresses).map((value) => ({
      id: nextRowId.current++,
      value,
    })),
  );
  const [rowErrorsById, setRowErrorsById] = useState<
    Record<number, AddressFieldErrors>
  >({});
  const previousAddressErrors = useRef<
    Record<number, AddressFieldErrors> | undefined
  >(undefined);

  useEffect(() => {
    if (previousAddressErrors.current === addressErrors) return;
    previousAddressErrors.current = addressErrors;

    const nextErrors: Record<number, AddressFieldErrors> = {};
    addresses.forEach((row, index) => {
      const errorForRow = addressErrors[index];
      if (errorForRow) nextErrors[row.id] = errorForRow;
    });
    setRowErrorsById(nextErrors);
  }, [addressErrors, addresses]);

  function updateAddress(
    index: number,
    field: keyof AddressFormValue,
    value: string,
  ) {
    setAddresses((current) =>
      current.map((row, currentIndex) =>
        currentIndex === index
          ? { ...row, value: { ...row.value, [field]: value } }
          : row,
      ),
    );
  }

  function removeAddress(index: number) {
    setAddresses((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Addresses</legend>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-2">
        <div>
          <h2 className="font-display text-sm font-semibold text-foreground">
            Addresses
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Add any number of Home, Work, or Other addresses.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setAddresses((current) => [
              ...current,
              { id: nextRowId.current++, value: { ...EMPTY_ADDRESS } },
            ])
          }
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Add address
        </Button>
      </div>

      <input
        type="hidden"
        name="addresses"
        value={JSON.stringify(addresses.map(({ value }) => value))}
      />

      {addresses.length === 0 ? (
        <div className="flex items-center gap-3 rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          <MapPin className="h-5 w-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          No addresses added.
        </div>
      ) : (
        <div className="space-y-4">
          {addresses.map((row, index) => {
            const address = row.value;
            const rowErrors = rowErrorsById[row.id] ?? {};
            const number = index + 1;
            const typeErrorId = `address-${index}-type-error`;

            return (
              <fieldset
                key={row.id}
                className="rounded-lg border border-border bg-card/50 p-4"
              >
                <legend className="sr-only">Address {number}</legend>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <MapPin
                      className="h-4 w-4 text-primary"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <span className="font-display text-sm font-semibold text-foreground">
                      Address {number}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove address ${number}`}
                    onClick={() => removeAddress(index)}
                  >
                    <Trash2
                      className="h-4 w-4"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    Remove
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor={`address-${index}-type`}
                      className="mb-1.5 block text-[13px] font-medium text-foreground"
                    >
                      Type
                    </label>
                    <select
                      id={`address-${index}-type`}
                      value={address.type}
                      aria-invalid={rowErrors.type ? true : undefined}
                      aria-describedby={rowErrors.type ? typeErrorId : undefined}
                      className={`${CONTROL} ${rowErrors.type ? "border-destructive" : ""}`}
                      onChange={(event) =>
                        updateAddress(index, "type", event.target.value)
                      }
                    >
                      {ADDRESS_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    {rowErrors.type ? (
                      <p
                        id={typeErrorId}
                        role="alert"
                        className="mt-1.5 text-[13px] text-destructive"
                      >
                        {rowErrors.type}
                      </p>
                    ) : null}
                  </div>

                  <div className="hidden sm:block" aria-hidden="true" />

                  <AddressField
                    index={index}
                    name="address"
                    label="Street address"
                    value={address.address}
                    error={rowErrors.address}
                    maxLength={300}
                    placeholder="1 Market St, Suite 400"
                    onChange={(value) => updateAddress(index, "address", value)}
                  />
                  <AddressField
                    index={index}
                    name="city"
                    label="City"
                    value={address.city}
                    error={rowErrors.city}
                    maxLength={120}
                    placeholder="San Francisco"
                    onChange={(value) => updateAddress(index, "city", value)}
                  />
                  <AddressField
                    index={index}
                    name="state"
                    label="State / region"
                    value={address.state}
                    error={rowErrors.state}
                    maxLength={120}
                    placeholder="CA"
                    onChange={(value) => updateAddress(index, "state", value)}
                  />
                  <AddressField
                    index={index}
                    name="postal_code"
                    label="Postal code"
                    value={address.postal_code}
                    error={rowErrors.postal_code}
                    maxLength={20}
                    placeholder="94105"
                    onChange={(value) => updateAddress(index, "postal_code", value)}
                  />
                  <AddressField
                    index={index}
                    name="country"
                    label="Country"
                    value={address.country}
                    error={rowErrors.country}
                    maxLength={120}
                    placeholder="USA"
                    onChange={(value) => updateAddress(index, "country", value)}
                  />
                </div>
              </fieldset>
            );
          })}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
