export type RouteType = "lab" | "morning" | "afternoon" | "allday" | "office";

export type PersonRole =
  | "owner"
  | "ops_manager"
  | "dispatch"
  | "full_time_driver"
  | "part_time_driver"
  | "on_call_driver";

/** Mon–Fri */
export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri";

export const WEEKDAY_KEYS: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri"];

/** Per shift type for one day (all route kinds including office for staff who cover office). */
export type DayShiftAvailability = Record<RouteType, boolean>;

/** Mon–Fri × shift types — granular availability for suggestions. */
export type WeeklyShiftAvailability = Record<WeekdayKey, DayShiftAvailability>;

export type Person = {
  id: string;
  name: string;
  role: PersonRole;
  email?: string;
  phone?: string;
  weeklyShiftAvailability: WeeklyShiftAvailability;
  /** Secret token for /my-availability (drivers & on-call). */
  profileToken?: string;
};

/** Reusable route catalog (dropdown in schedule rows). */
export type RouteDefinition = {
  id: string;
  name: string;
  routeType: RouteType;
  /** When true, only Ops Manager / Dispatch / Owner may be assigned; at least one office slot should stay filled per day. */
  isOfficeRoute?: boolean;
};

export type SlotTemplate = {
  id: string;
  routeDefinitionId: string;
  /** Default assignee per weekday (same route, different drivers on different days). */
  defaultDriversByDay: Record<WeekdayKey, string | null>;
};

export type ScheduleSlot = {
  id: string;
  date: string;
  routeType: RouteType;
  label: string;
  driverId: string | null;
  isGap: boolean;
  gapReason?: string;
  /** Set when gap created by this person's time off — used for coverage stats */
  gapForDriverId?: string | null;
  isOfficeSlot: boolean;
};

export type TimeOffRequest = {
  id: string;
  driverId: string;
  driverName: string;
  date: string;
  routeTypes: RouteType[];
  note?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export type OpenShiftStatus = "open" | "filled" | "cancelled";

export type OpenShift = {
  id: string;
  slotId: string;
  date: string;
  routeType: RouteType;
  label: string;
  status: OpenShiftStatus;
  claimedById: string | null;
  claimedByName: string | null;
  /** Awaits manager/dispatcher approval before assignment */
  pendingClaimDriverId: string | null;
  pendingClaimDriverName: string | null;
  pendingClaimAt: string | null;
  invitedAt: string | null;
  notificationLog: { at: string; channel: string; message: string }[];
};

export type Announcement = {
  id: string;
  subject: string;
  body: string;
  createdAt: string;
  createdByName?: string;
};

export type AbsenceYearStats = {
  personId: string;
  year: number;
  /** Approved time-off days (distinct dates) in this year */
  requestedDayCount: number;
  /** Days others covered this person’s shifts (gaps filled) */
  coveredAbsenceDayCount: number;
};

/** Dedupe for 24h reminders when someone non-default is assigned to a slot */
export type NonDefaultShiftReminder = {
  key: string;
  sentAt: string;
};

export type AppSettings = {
  routeDefinitions: RouteDefinition[];
  slotTemplates: SlotTemplate[];
  fillPriorityIds: string[];
  defaultWeekStart: string;
};

/** Saved per `ScheduleSlot.id` (date__templateId) so changing weeks does not rebuild away manager edits */
export type SlotOverrideState = {
  driverId: string | null;
  isGap: boolean;
  gapReason?: string;
  gapForDriverId?: string | null;
};

export type AppData = {
  people: Person[];
  slots: ScheduleSlot[];
  timeOffRequests: TimeOffRequest[];
  openShifts: OpenShift[];
  announcements: Announcement[];
  absenceStats: AbsenceYearStats[];
  /** Keys like `nd-{slotId}-{driverId}` once a non-default 24h reminder was sent */
  nonDefaultShiftReminders?: NonDefaultShiftReminder[];
  slotOverrides?: Record<string, SlotOverrideState>;
  settings: AppSettings;
};
