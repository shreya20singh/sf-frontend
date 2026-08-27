"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { ImagePlus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  ACCEPTED_PHOTO_TYPES,
  PHOTO_FILE_FIELD,
  photoFileValidationError,
  photoValidationError,
} from "@/lib/contacts/schema";

export default function ContactPhotoField({
  initialPhoto,
  error,
}: {
  initialPhoto?: string | null;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<FileReader | null>(null);
  const readVersionRef = useRef(0);
  const [photo, setPhoto] = useState(initialPhoto ?? "");
  const [clientError, setClientError] = useState<string>();
  const [hasChanged, setHasChanged] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const displayedError = hasChanged ? clientError : error;
  const errorId = "contact-photo-error";

  useEffect(() => {
    setPreviewError(false);
  }, [photo]);

  useEffect(
    () => () => {
      readVersionRef.current += 1;
      readerRef.current?.abort();
      readerRef.current = null;
    },
    [],
  );

  function invalidateRead(): number {
    readVersionRef.current += 1;
    readerRef.current?.abort();
    readerRef.current = null;
    return readVersionRef.current;
  }

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const readVersion = invalidateRead();
    setHasChanged(true);

    const fileError = photoFileValidationError(file);
    if (fileError) {
      setClientError(fileError);
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    readerRef.current = reader;
    const isCurrentRead = () =>
      readVersionRef.current === readVersion && readerRef.current === reader;
    reader.onload = () => {
      if (!isCurrentRead()) return;
      readerRef.current = null;
      if (typeof reader.result !== "string") {
        setClientError("The photo could not be read");
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      const validationError = photoValidationError(reader.result);
      if (validationError) {
        setClientError(validationError);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      setPhoto(reader.result);
      setClientError(undefined);
      if (inputRef.current) inputRef.current.value = "";
    };
    reader.onerror = () => {
      if (!isCurrentRead()) return;
      readerRef.current = null;
      setClientError("The photo could not be read");
      if (inputRef.current) inputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    invalidateRead();
    setHasChanged(true);
    setPhoto("");
    setClientError(undefined);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Photo</legend>

      <div className="border-b border-hairline pb-2">
        <h2 className="font-display text-sm font-semibold text-foreground">
          Photo
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Optional JPG, PNG, WebP, or GIF image up to 2 MB.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary/40">
          {photo && !previewError ? (
            <Image
              src={photo}
              alt="Contact photo preview"
              width={96}
              height={96}
              unoptimized
              onError={() => setPreviewError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <ImagePlus
              className="h-8 w-8 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="space-y-2">
          <label
            htmlFor="contact-photo"
            className="block text-[13px] font-medium text-foreground"
          >
            Contact photo
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              optional
            </span>
          </label>
          <input
            ref={inputRef}
            id="contact-photo"
            type="file"
            name={PHOTO_FILE_FIELD}
            accept={ACCEPTED_PHOTO_TYPES.join(",")}
            onChange={selectPhoto}
            aria-invalid={displayedError ? true : undefined}
            aria-describedby={displayedError ? errorId : undefined}
            className="block max-w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-secondary-foreground hover:file:bg-secondary/70"
          />
          <input type="hidden" name="photo" value={photo} />
          {photo ? (
            <Button type="button" variant="ghost" size="sm" onClick={removePhoto}>
              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Remove photo
            </Button>
          ) : null}
          {displayedError ? (
            <p id={errorId} role="alert" className="text-[13px] text-destructive">
              {displayedError}
            </p>
          ) : null}
        </div>
      </div>
    </fieldset>
  );
}
