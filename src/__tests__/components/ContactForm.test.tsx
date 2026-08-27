import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactForm from "@/components/contacts/ContactForm";
import { makeContact } from "../mocks/handlers";
import type { FormState } from "@/lib/contacts/types";

const PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PHOTO_BYTES = Uint8Array.from(
  atob(PHOTO.slice("data:image/png;base64,".length)),
  (character) => character.charCodeAt(0),
);

function renderForm(action: jest.Mock, contact?: ReturnType<typeof makeContact>) {
  return render(
    <ContactForm
      action={action as never}
      contact={contact}
      submitLabel="Create contact"
      cancelHref="/contacts"
    />,
  );
}

describe("ContactForm", () => {
  it("renders every editable field", () => {
    renderForm(jest.fn());

    expect(screen.getByLabelText(/first name/i)).toBeRequired();
    expect(screen.getByLabelText(/last name/i)).toBeRequired();
    expect(screen.getByLabelText(/^email/i)).toBeRequired();
    expect(screen.getByLabelText(/contact photo/i)).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp,image/gif",
    );
    expect(screen.getByLabelText(/contact photo/i)).toHaveAttribute(
      "name",
      "photo_file",
    );
    expect(screen.getByLabelText(/phone/i)).not.toBeRequired();
    expect(screen.getByLabelText(/notes/i).tagName).toBe("TEXTAREA");
  });

  it("prefills and preserves an existing photo", async () => {
    const action = jest.fn<Promise<FormState>, [FormState, FormData]>(
      async () => ({ status: "idle" }),
    );
    renderForm(action, makeContact({ photo: PHOTO }));

    expect(
      screen.getByRole("img", { name: /contact photo preview/i }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0][1].get("photo")).toBe(PHOTO);
  });

  it("reads a selected photo into the submitted form", async () => {
    const action = jest.fn<Promise<FormState>, [FormState, FormData]>(
      async () => ({ status: "idle" }),
    );
    renderForm(action);
    const photo = new File(
      [PHOTO_BYTES],
      "avatar.png",
      { type: "image/png" },
    );

    await userEvent.upload(screen.getByLabelText(/contact photo/i), photo);
    expect(
      await screen.findByRole("img", { name: /contact photo preview/i }),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/first name/i), "Grace");
    await userEvent.type(screen.getByLabelText(/last name/i), "Hopper");
    await userEvent.type(screen.getByLabelText(/^email/i), "grace@example.com");
    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0][1].get("photo")).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it("shows a server photo error after local interaction", async () => {
    const action = jest.fn<Promise<FormState>, [FormState, FormData]>(
      async () => ({
        status: "error",
        message: "The API rejected these values.",
        fieldErrors: { photo: "Photo content is invalid." },
      }),
    );
    renderForm(action);

    await userEvent.upload(
      screen.getByLabelText(/contact photo/i),
      new File([PHOTO_BYTES], "avatar.png", { type: "image/png" }),
    );
    await screen.findByRole("img", { name: /contact photo preview/i });
    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));

    expect(
      await screen.findByText("Photo content is invalid."),
    ).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText(/contact photo/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("can remove an existing photo", async () => {
    const action = jest.fn<Promise<FormState>, [FormState, FormData]>(
      async () => ({ status: "idle" }),
    );
    renderForm(action, makeContact({ photo: PHOTO }));

    await userEvent.click(screen.getByRole("button", { name: /remove photo/i }));
    expect(screen.queryByRole("img", { name: /contact photo preview/i })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0][1].get("photo")).toBe("");
  });

  it("rejects unsupported photo files before submission", async () => {
    renderForm(jest.fn());
    const photo = new File(["<svg/>"], "avatar.svg", { type: "image/svg+xml" });

    await userEvent.upload(screen.getByLabelText(/contact photo/i), photo);

    expect(
      screen.getByText("Choose a JPG, PNG, WebP, or GIF image"),
    ).toHaveAttribute("role", "alert");
    expect(screen.queryByRole("img", { name: /contact photo preview/i })).toBeNull();
  });

  it("prefills from an existing contact", () => {
    renderForm(jest.fn(), makeContact());

    expect(screen.getByLabelText(/first name/i)).toHaveValue("Ada");
    expect(screen.getByLabelText(/^email/i)).toHaveValue("ada@example.com");
    // Nulls become empty inputs rather than the string "null".
    expect(screen.getByLabelText(/street address/i)).toHaveValue("");
  });

  it("submits the entered values to the action", async () => {
    const action = jest.fn<Promise<FormState>, [FormState, FormData]>(
      async () => ({ status: "idle" }),
    );
    renderForm(action);

    await userEvent.type(screen.getByLabelText(/first name/i), "Grace");
    await userEvent.type(screen.getByLabelText(/last name/i), "Hopper");
    await userEvent.type(screen.getByLabelText(/^email/i), "grace@example.com");
    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());

    const formData = action.mock.calls[0][1];
    expect(formData.get("first_name")).toBe("Grace");
    expect(formData.get("email")).toBe("grace@example.com");
  });

  it("shows the summary and the per-field errors the action returns", async () => {
    const action = jest.fn(
      async (): Promise<FormState> => ({
        status: "error",
        message: "That email address is already taken.",
        fieldErrors: { email: "This email is already in use." },
        values: { first_name: "Grace" },
      }),
    );
    renderForm(action);

    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((node) => node.textContent)).toEqual(
      expect.arrayContaining([
        "That email address is already taken.",
        "This email is already in use.",
      ]),
    );
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("links back out without submitting", () => {
    renderForm(jest.fn());
    expect(screen.getByRole("link", { name: /cancel/i })).toHaveAttribute(
      "href",
      "/contacts",
    );
  });
});
