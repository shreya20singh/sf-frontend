import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
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
    expect(screen.getByRole("button", { name: /add address/i })).toBeInTheDocument();
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
    expect(screen.getByLabelText(/street address/i)).toHaveValue("1 Market St");
    expect(screen.getByLabelText(/^type$/i)).toHaveValue("Work");
  });

  it("adds, removes, and submits multiple addresses in order", async () => {
    const action = jest.fn<Promise<FormState>, [FormState, FormData]>(
      async () => ({ status: "idle" }),
    );
    renderForm(action);

    await userEvent.click(screen.getByRole("button", { name: /add address/i }));
    const first = screen.getByRole("group", { name: "Address 1" });
    await userEvent.selectOptions(within(first).getByLabelText("Type"), "Home");
    await userEvent.type(
      within(first).getByLabelText("Street address"),
      "12 Home St",
    );

    await userEvent.click(screen.getByRole("button", { name: /add address/i }));
    const second = screen.getByRole("group", { name: "Address 2" });
    await userEvent.selectOptions(within(second).getByLabelText("Type"), "Work");
    await userEvent.type(
      within(second).getByLabelText("Street address"),
      "1 Market St",
    );
    await userEvent.type(within(second).getByLabelText("City"), "San Francisco");

    await userEvent.click(
      within(first).getByRole("button", { name: /remove address 1/i }),
    );

    await userEvent.type(screen.getByLabelText(/first name/i), "Grace");
    await userEvent.type(screen.getByLabelText(/last name/i), "Hopper");
    await userEvent.type(screen.getByLabelText(/^email/i), "grace@example.com");
    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(JSON.parse(String(action.mock.calls[0][1].get("addresses")))).toEqual([
      {
        type: "Work",
        address: "1 Market St",
        city: "San Francisco",
        state: "",
        postal_code: "",
        country: "",
      },
    ]);
  });

  it("shows an error on the exact address field", async () => {
    const action = jest.fn(
      async (): Promise<FormState> => ({
        status: "error",
        message: "Please fix the highlighted fields.",
        addressErrors: {
          0: { address: "Street address is required" },
        },
        values: {
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
        },
      }),
    );
    renderForm(action, makeContact());

    await userEvent.clear(screen.getByLabelText("Street address"));
    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));

    expect(
      await screen.findByText("Street address is required"),
    ).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText("Street address")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("keeps address errors attached when a preceding row is removed", async () => {
    const action = jest.fn(
      async (): Promise<FormState> => ({
        status: "error",
        message: "Please fix the highlighted fields.",
        addressErrors: {
          0: { address: "First address is required" },
          1: { address: "Second address is required" },
        },
        values: {
          addresses: JSON.stringify([
            {
              type: "Home",
              address: "",
              city: "",
              state: "",
              postal_code: "",
              country: "",
            },
            {
              type: "Work",
              address: "",
              city: "",
              state: "",
              postal_code: "",
              country: "",
            },
          ]),
        },
      }),
    );
    renderForm(
      action,
      makeContact({
        addresses: [
          {
            id: 1,
            type: "Home",
            address: "",
            city: null,
            state: null,
            postal_code: null,
            country: null,
          },
          {
            id: 2,
            type: "Work",
            address: "",
            city: null,
            state: null,
            postal_code: null,
            country: null,
          },
        ],
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));
    expect(await screen.findByText("First address is required")).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole("group", { name: "Address 1" })).getByRole(
        "button",
        { name: /remove address 1/i },
      ),
    );

    expect(screen.queryByText("First address is required")).toBeNull();
    expect(
      within(screen.getByRole("group", { name: "Address 1" })).getByText(
        "Second address is required",
      ),
    ).toBeInTheDocument();
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
