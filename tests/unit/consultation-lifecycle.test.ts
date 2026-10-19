import { describe, it, expect } from "vitest";
import { ConsultationStatus } from "@prisma/client";

describe("Consultation Lifecycle State Machine", () => {
  const VALID_TRANSITIONS: Record<ConsultationStatus, ConsultationStatus[]> = {
    [ConsultationStatus.PENDING_PAYMENT]: [
      ConsultationStatus.SCHEDULED,
      ConsultationStatus.CANCELLED,
    ],
    [ConsultationStatus.SCHEDULED]: [
      ConsultationStatus.IN_PROGRESS,
      ConsultationStatus.CANCELLED,
      ConsultationStatus.NO_SHOW,
    ],
    [ConsultationStatus.IN_PROGRESS]: [
      ConsultationStatus.COMPLETED,
      ConsultationStatus.CANCELLED,
    ],
    [ConsultationStatus.COMPLETED]: [],
    [ConsultationStatus.CANCELLED]: [],
    [ConsultationStatus.NO_SHOW]: [],
  };

  function canTransition(
    current: ConsultationStatus,
    next: ConsultationStatus,
  ): boolean {
    return VALID_TRANSITIONS[current]?.includes(next) ?? false;
  }

  it("should permit valid forward lifecycle progression", () => {
    expect(
      canTransition(
        ConsultationStatus.PENDING_PAYMENT,
        ConsultationStatus.SCHEDULED,
      ),
    ).toBe(true);
    expect(
      canTransition(
        ConsultationStatus.SCHEDULED,
        ConsultationStatus.IN_PROGRESS,
      ),
    ).toBe(true);
    expect(
      canTransition(
        ConsultationStatus.IN_PROGRESS,
        ConsultationStatus.COMPLETED,
      ),
    ).toBe(true);
  });

  it("should permit cancellation from non-terminal states", () => {
    expect(
      canTransition(
        ConsultationStatus.PENDING_PAYMENT,
        ConsultationStatus.CANCELLED,
      ),
    ).toBe(true);
    expect(
      canTransition(ConsultationStatus.SCHEDULED, ConsultationStatus.CANCELLED),
    ).toBe(true);
    expect(
      canTransition(
        ConsultationStatus.IN_PROGRESS,
        ConsultationStatus.CANCELLED,
      ),
    ).toBe(true);
  });

  it("should reject transitions from terminal states", () => {
    expect(
      canTransition(ConsultationStatus.COMPLETED, ConsultationStatus.SCHEDULED),
    ).toBe(false);
    expect(
      canTransition(
        ConsultationStatus.COMPLETED,
        ConsultationStatus.IN_PROGRESS,
      ),
    ).toBe(false);
    expect(
      canTransition(ConsultationStatus.CANCELLED, ConsultationStatus.SCHEDULED),
    ).toBe(false);
    expect(
      canTransition(ConsultationStatus.NO_SHOW, ConsultationStatus.SCHEDULED),
    ).toBe(false);
  });

  it("should reject invalid non-sequential skips", () => {
    expect(
      canTransition(
        ConsultationStatus.PENDING_PAYMENT,
        ConsultationStatus.COMPLETED,
      ),
    ).toBe(false);
    expect(
      canTransition(ConsultationStatus.SCHEDULED, ConsultationStatus.COMPLETED),
    ).toBe(false);
  });
});
