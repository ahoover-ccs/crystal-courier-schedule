export const TIME_OFF_HANDBOOK_URL =
  "https://docs.google.com/document/d/1tkV-jYXgViCb47lPQVk8Ns1GVNjzLqwNFZizfJLK8Gk/edit?tab=t.0#bookmark=id.wj0jpbu3yx03";

export type PreviewTone = "ok" | "caution" | "warning" | "danger";

export type OthersOutPreviewCopy = {
  tone: PreviewTone;
  text: string;
};

export type AttendancePreviewCopy = {
  tone: PreviewTone;
  text: string;
  includeHandbookLink: boolean;
};

export function formatAbsenceDays(days: number): string {
  const rounded = Math.round(days * 2) / 2;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(1);
}

export function othersOutPreviewCopy(count: number): OthersOutPreviewCopy {
  if (count <= 0) {
    return {
      tone: "ok",
      text: "No other drivers are currently scheduled out during the requested shifts.",
    };
  }
  if (count === 1) {
    return {
      tone: "caution",
      text: "1 driver is already scheduled out. Although your chances are good that approval will be granted, please note that time off is based on a first-come, first served basis and requires management approval.",
    };
  }
  if (count === 2) {
    return {
      tone: "warning",
      text: "2 drivers are already scheduled out, which is our maximum number of drivers that we like to allow off at a time. Your chances that management will be able to approve this are low. We ask that you find another date. If you're unable to do so, please speak with a manager.",
    };
  }
  return {
    tone: "danger",
    text: `Uh oh. ${count} drivers are already scheduled out. We're a small team and don't have enough resources to grant approval for this request. We ask that you find another date. If you're unable to do so, please speak with a manager.`,
  };
}

export function attendancePreviewCopy(
  days: number,
  employedLessThanOneYear: boolean
): AttendancePreviewCopy | null {
  if (employedLessThanOneYear) {
    if (days >= 15) {
      return {
        tone: "danger",
        text: "Yikes....you've missed at least 15 days this year. Please come and speak with Aaron.",
        includeHandbookLink: false,
      };
    }
    if (days >= 12) {
      return {
        tone: "danger",
        text: "Oh no....you're officially on probation as you've missed at least 12 days in the trailing 12 months. Be careful as 15 missed days will result in termination. Please refer to our employee handbook for more information at:",
        includeHandbookLink: true,
      };
    }
    if (days >= 10) {
      return {
        tone: "warning",
        text: "Whoa! This is your official warning....you've missed at least 10 days in the trailing 12 months. At missed 12 days, that'll be a probation. At 15 days, that's termination. Please be sure to be here more often. Please refer to our employee handbook for more information at:",
        includeHandbookLink: true,
      };
    }
    return null;
  }

  if (days >= 20) {
    return {
      tone: "danger",
      text: "Yikes....you've missed at least 15 days this year (in addition to your allotted vacation). Please come and speak with Aaron.",
      includeHandbookLink: false,
    };
  }
  if (days >= 17) {
    return {
      tone: "danger",
      text: "Oh no....you're officially on probation as you've missed at least 12 days in the trailing 12 months (in addition to your allotted vacation). Be careful as 15 missed days will result in termination. Please refer to our employee handbook for more information at:",
      includeHandbookLink: true,
    };
  }
  if (days >= 15) {
    return {
      tone: "warning",
      text: "Whoa! This is your official warning....you've missed at least 10 days in the trailing 12 months (in addition to your allotted vacation). At missed 12 days, that'll be a probation. At 15 days, that's termination. Please be sure to be here more often. Please refer to our employee handbook for more information at:",
      includeHandbookLink: true,
    };
  }
  return null;
}
