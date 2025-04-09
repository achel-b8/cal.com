import { TooltipProvider } from "@radix-ui/react-tooltip";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import * as React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { vi } from "vitest";

import { FormBuilder } from "./FormBuilder";
import { mockProps, setMockIntersectionObserver, setMockMatchMedia, pageObject } from "./testUtils";

vi.mock("@formkit/auto-animate/react", () => ({
  useAutoAnimate: () => [null],
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: vi.fn(() => ({
      push: vi.fn(() => {
        return;
      }),
    })),
  };
});

const renderComponent = ({
  formBuilderProps: formBuilderProps,
  formDefaultValues: formDefaultValues,
}: {
  formBuilderProps: Parameters<typeof FormBuilder>[0];
  formDefaultValues;
}) => {
  const Wrapper = ({ children }: { children: ReactNode }) => {
    const form = useForm({
      defaultValues: formDefaultValues,
    });
    return (
      <TooltipProvider>
        <FormProvider {...form}>{children}</FormProvider>
      </TooltipProvider>
    );
  };

  return render(<FormBuilder {...formBuilderProps} />, { wrapper: Wrapper });
};

describe("FormBuilder Close Button", () => {
  beforeAll(() => {
    setMockMatchMedia();
    setMockIntersectionObserver();
  });

  beforeEach(() => {
    renderComponent({ formBuilderProps: mockProps, formDefaultValues: {} });
  });

  it("should render close button in dialog", async () => {
    const dialog = pageObject.openAddFieldDialog();

    const closeButton = dialog.getByRole("button", { name: "閉じる" });
    expect(closeButton).toBeInTheDocument();
  });

  it("should close dialog when close button is clicked", async () => {
    const dialog = pageObject.openAddFieldDialog();

    const closeButton = dialog.getByRole("button", { name: "閉じる" });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByTestId("edit-field-dialog")).not.toBeInTheDocument();
    });
  });

  it("should show confirmation dialog when there are unsaved changes", async () => {
    const dialog = pageObject.openAddFieldDialog();

    pageObject.dialog.selectFieldType({ dialog, fieldType: "text" });
    pageObject.dialog.fillInFieldIdentifier({ dialog, identifier: "test-id" });
    pageObject.dialog.fillInFieldLabel({ dialog, label: "Test Label", fieldType: "text" });

    const closeButton = dialog.getByRole("button", { name: "閉じる" });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.getByText(/未保存の変更があります/)).toBeInTheDocument();
    });
  });

  it("should close dialog when confirmation dialog is confirmed", async () => {
    const dialog = pageObject.openAddFieldDialog();

    pageObject.dialog.selectFieldType({ dialog, fieldType: "text" });
    pageObject.dialog.fillInFieldIdentifier({ dialog, identifier: "test-id" });
    pageObject.dialog.fillInFieldLabel({ dialog, label: "Test Label", fieldType: "text" });

    const closeButton = dialog.getByRole("button", { name: "閉じる" });
    fireEvent.click(closeButton);

    const confirmButton = screen.getByRole("button", { name: /閉じる/ });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.queryByTestId("edit-field-dialog")).not.toBeInTheDocument();
    });
  });

  it("should keep dialog open when confirmation dialog is cancelled", async () => {
    const dialog = pageObject.openAddFieldDialog();

    pageObject.dialog.selectFieldType({ dialog, fieldType: "text" });
    pageObject.dialog.fillInFieldIdentifier({ dialog, identifier: "test-id" });
    pageObject.dialog.fillInFieldLabel({ dialog, label: "Test Label", fieldType: "text" });

    const closeButton = dialog.getByRole("button", { name: "閉じる" });
    fireEvent.click(closeButton);

    const cancelButton = screen.getByRole("button", { name: /キャンセル/ });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.getByTestId("edit-field-dialog")).toBeInTheDocument();
    });
  });
});
