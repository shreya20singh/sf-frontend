"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import { avatarHue, initials } from "@/lib/contacts/format";
import type { Contact } from "@/lib/contacts/types";

const SIZES = {
  sm: { classes: "h-8 w-8 text-[11px]", pixels: 32 },
  md: { classes: "h-10 w-10 text-sm", pixels: 40 },
  lg: { classes: "h-14 w-14 text-lg", pixels: 56 },
} as const;

export default function ContactAvatar({
  contact,
  size = "md",
}: {
  contact: Pick<Contact, "first_name" | "last_name" | "email" | "photo">;
  size?: keyof typeof SIZES;
}) {
  const dimensions = SIZES[size];
  const fullName = `${contact.first_name} ${contact.last_name}`.trim();
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [contact.photo]);

  if (contact.photo && !imageError) {
    return (
      <Image
        src={contact.photo}
        alt={`Profile photo of ${fullName}`}
        width={dimensions.pixels}
        height={dimensions.pixels}
        unoptimized
        onError={() => setImageError(true)}
        className={`${dimensions.classes} shrink-0 rounded-full border border-border object-cover`}
      />
    );
  }

  const style = {
    "--avatar-hue": avatarHue(contact.email),
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      style={style}
      className={`contact-avatar inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-semibold ${dimensions.classes}`}
    >
      {initials(contact)}
    </span>
  );
}
