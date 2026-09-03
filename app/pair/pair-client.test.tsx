import { StrictMode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  createAnonymousDeviceUser: vi.fn(),
  claimPatientDevice: vi.fn(),
  setActivePatientId: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/supabase/auth", () => ({
  currentUser: mocks.currentUser,
  createAnonymousDeviceUser: mocks.createAnonymousDeviceUser,
}));

vi.mock("@/lib/supabase/patients", () => ({
  claimPatientDevice: mocks.claimPatientDevice,
}));

vi.mock("@/lib/patient-context", () => ({
  setActivePatientId: mocks.setActivePatientId,
}));

import PairClient from "@/app/pair/pair-client";

let container: HTMLDivElement;

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

describe("PairClient", () => {
  it("pairs exactly once and redirects when React Strict Mode remounts effects", async () => {
    mocks.currentUser.mockResolvedValue(null);
    mocks.createAnonymousDeviceUser.mockResolvedValue({ is_anonymous: true });
    mocks.claimPatientDevice.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      displayName: "Test patient",
      preferredLanguage: "en",
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <StrictMode>
          <PairClient token="one-time-token" />
        </StrictMode>,
      );
    });

    await vi.waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/patient");
    });
    expect(mocks.currentUser).toHaveBeenCalledOnce();
    expect(mocks.createAnonymousDeviceUser).toHaveBeenCalledOnce();
    expect(mocks.claimPatientDevice).toHaveBeenCalledOnce();
    expect(mocks.setActivePatientId).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );

    await act(async () => root.unmount());
  });
});
