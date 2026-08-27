import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin, Pencil } from "lucide-react";
import ContactAvatar from "@/components/contacts/ContactAvatar";
import DeleteContactButton from "@/components/contacts/DeleteContactButton";
import { buttonClasses } from "@/components/ui/Button";
import { getContact } from "@/lib/contacts/api";
import { addressLine, formatTimestamp, jobLine } from "@/lib/contacts/format";
import { ADDRESS_TYPES } from "@/lib/contacts/types";

type PageProps = { params: Promise<{ id: string }> };

function parseId(raw: string): number {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) notFound();
  return id;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const contact = await getContact(parseId((await params).id));
  return {
    title: contact?.full_name ?? "Contact not found",
    description: contact ? jobLine(contact) ?? undefined : undefined,
  };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-hairline px-4 py-3 last:border-b-0 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm text-foreground">
        {children ?? <span className="text-muted-foreground/50">—</span>}
      </dd>
    </div>
  );
}

export default async function ContactDetailPage({ params }: PageProps) {
  const contact = await getContact(parseId((await params).id));
  if (!contact) notFound();

  const subtitle = jobLine(contact);
  const addressGroups = ADDRESS_TYPES.map((type) => ({
    type,
    addresses: contact.addresses.filter((address) => address.type === type),
  })).filter((group) => group.addresses.length > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        All contacts
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ContactAvatar contact={contact} size="lg" />
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {contact.full_name}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/contacts/${contact.id}/edit`}
            className={buttonClasses("secondary")}
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Edit
          </Link>
          <DeleteContactButton
            contactId={contact.id}
            contactName={contact.full_name}
            redirectToList
            variant="danger"
            size="md"
            withLabel
          />
        </div>
      </header>

      <dl className="rounded-lg border border-border bg-card">
        <Row label="Email">
          <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
            {contact.email}
          </a>
        </Row>
        <Row label="Phone">
          {contact.phone ? (
            <a href={`tel:${contact.phone}`} className="text-primary hover:underline">
              {contact.phone}
            </a>
          ) : null}
        </Row>
        <Row label="Company">{contact.company}</Row>
        <Row label="Job title">{contact.job_title}</Row>
        <Row label="Notes">
          {contact.notes ? (
            <span className="whitespace-pre-wrap">{contact.notes}</span>
          ) : null}
        </Row>
      </dl>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-hairline px-4 py-3">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Addresses
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {contact.addresses.length === 1
              ? "1 saved address"
              : `${contact.addresses.length} saved addresses`}
          </p>
        </div>

        {addressGroups.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-5 text-sm text-muted-foreground">
            <MapPin className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            No addresses saved.
          </div>
        ) : (
          <div className="space-y-5 p-4">
            {addressGroups.map((group) => (
              <div key={group.type} className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                  {group.type}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.addresses.map((address) => (
                    <address
                      key={address.id}
                      className="flex gap-3 rounded-md border border-hairline bg-secondary/20 p-3 text-sm not-italic text-foreground"
                    >
                      <MapPin
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <span>{addressLine(address)}</span>
                    </address>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <dl className="rounded-lg border border-border bg-card/50 text-[13px]">
        <Row label="ID">
          <span className="font-mono">{contact.id}</span>
        </Row>
        <Row label="Created">
          <span className="font-mono">{formatTimestamp(contact.created_at)}</span>
        </Row>
        <Row label="Last updated">
          <span className="font-mono">{formatTimestamp(contact.updated_at)}</span>
        </Row>
      </dl>
    </div>
  );
}
