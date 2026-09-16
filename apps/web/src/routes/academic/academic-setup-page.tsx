import { useCallback, useEffect, useState } from "react";
import { differenceInCalendarMonths, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { PencilIcon, XIcon } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

import { useAppStore } from "@/stores/app-store";
import { api, type AcademicSession, type CalendarHoliday, type DayType, type SchoolCalendarData } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PRINT_PAPER_COLORS, PRINT_TEMPLATES, type PrintPaperColor, type PrintTemplate } from "@/components/print-templates";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PromotionTab } from "./promotion-tab";

function SchoolDetailsTab() {
  const branches = useAppStore((s) => s.branches);
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const refreshBranches = useAppStore((s) => s.refreshBranches);
  const branch = branches.find((b) => b.id === selectedBranchId);

  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    phone: "",
    email: "",
    logo_url: "",
    signature_url: "",
  });
  const [printTemplate, setPrintTemplate] = useState<PrintTemplate>("classic");
  const [printPaperColor, setPrintPaperColor] = useState<PrintPaperColor>("white");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);

  useEffect(() => {
    if (branch) {
      setForm({
        name: branch.name,
        address: branch.address ?? "",
        city: branch.city ?? "",
        state: branch.state ?? "",
        pincode: branch.pincode ?? "",
        phone: branch.phone ?? "",
        email: branch.email ?? "",
        logo_url: branch.logo_url ?? "",
        signature_url: branch.signature_url ?? "",
      });
      setPrintTemplate((branch.print_template as PrintTemplate) || "classic");
      setPrintPaperColor((branch.print_paper_color as PrintPaperColor) || "white");
    }
  }, [branch]);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const SIGNATURE_MAX_BYTES = 200 * 1024;

  const handleSignatureFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSignatureError(null);
    if (file.size > SIGNATURE_MAX_BYTES) {
      setSignatureError(`Image is too large (max ${SIGNATURE_MAX_BYTES / 1024}KB).`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, signature_url: reader.result as string }));
    reader.onerror = () => setSignatureError("Could not read that file. Please try again.");
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branch) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      await api.updateBranch({
        id: branch.id,
        name: form.name,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        phone: form.phone || null,
        email: form.email || null,
        logo_url: form.logo_url || null,
        signature_url: form.signature_url || null,
        print_template: printTemplate,
        print_paper_color: printPaperColor,
      });
      await refreshBranches();
      setMessage("Saved.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!branch) {
    return <p className="text-muted-foreground">Select a branch to edit its details.</p>;
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">School details</CardTitle>
        <p className="text-sm text-muted-foreground">
          Shown on printed documents: attendance registers, report cards, payslips, and fee receipts.
        </p>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="school-name">Name</Label>
            <Input id="school-name" value={form.name} onChange={update("name")} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="school-address">Address</Label>
            <Input id="school-address" value={form.address} onChange={update("address")} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-city">City</Label>
              <Input id="school-city" value={form.city} onChange={update("city")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-state">State</Label>
              <Input id="school-state" value={form.state} onChange={update("state")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-pincode">Pincode</Label>
              <Input id="school-pincode" value={form.pincode} onChange={update("pincode")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-phone">Phone</Label>
              <Input id="school-phone" value={form.phone} onChange={update("phone")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-email">Email</Label>
              <Input id="school-email" type="email" value={form.email} onChange={update("email")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="school-logo">Logo URL</Label>
            <Input id="school-logo" placeholder="https://..." value={form.logo_url} onChange={update("logo_url")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="school-signature">Signature (for printed documents)</Label>
            <p className="text-xs text-muted-foreground">
              Shown above "Authorized signatory" on payslips, fee receipts, attendance registers, and report cards.
              PNG or JPEG, up to 200KB.
            </p>
            <div className="flex items-center gap-3">
              {form.signature_url && (
                <img src={form.signature_url} alt="Signature preview" className="h-14 rounded border object-contain p-1" />
              )}
              <Input id="school-signature" type="file" accept="image/png,image/jpeg" onChange={handleSignatureFile} className="max-w-64" />
              {form.signature_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, signature_url: "" }))}
                >
                  Remove
                </Button>
              )}
            </div>
            {signatureError && <p className="text-sm text-destructive">{signatureError}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Print template</Label>
            <p className="text-xs text-muted-foreground">
              Applies to payslips, fee receipts, attendance registers, and report cards.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PRINT_TEMPLATES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setPrintTemplate(t.value)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    printTemplate === t.value ? "border-primary bg-primary/5" : "hover:bg-muted",
                  )}
                >
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Paper color</Label>
            <div className="flex flex-wrap gap-2">
              {PRINT_PAPER_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setPrintPaperColor(c.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-2 pr-3 text-left transition-colors",
                    printPaperColor === c.value ? "border-primary bg-primary/5" : "hover:bg-muted",
                  )}
                >
                  <span className={cn("size-5 rounded-full", c.swatchClass)} />
                  <span className="text-sm font-medium">{c.label}</span>
                </button>
              ))}
            </div>
          </div>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          <div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function HolidayDialog({
  branchId,
  sessionId,
  date,
  existing,
  onClose,
  onSaved,
}: {
  branchId: string;
  sessionId: string;
  date: Date;
  existing: CalendarHoliday | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<"holiday" | "half_day">(existing?.type ?? "holiday");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const iso = format(date, "yyyy-MM-dd");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (existing) {
        await api.updateHoliday(existing.id, { date: iso, name, type });
      } else {
        await api.addHoliday({ branch_id: branchId, academic_session_id: sessionId, date: iso, name, type });
      }
      onSaved();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = async () => {
    if (!existing) return;
    if (!window.confirm(`Remove holiday "${existing.name}"?`)) return;
    setIsSubmitting(true);
    try {
      await api.deleteHoliday(existing.id);
      onSaved();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{format(date, "EEEE, d MMMM yyyy")}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSave}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="holiday-name">Name</Label>
            <Input
              id="holiday-name"
              placeholder="e.g. Diwali"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "holiday" | "half_day")}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="holiday">Full holiday</SelectItem>
                <SelectItem value="half_day">Half day</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="sm:justify-between">
            {existing ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={handleClear} disabled={isSubmitting}>
                Clear override
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={isSubmitting || !name}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SchoolCalendarTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManage = hasPermission("academic_setup.manage_sessions");

  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [calendar, setCalendar] = useState<SchoolCalendarData | null>(null);
  const [dayTypes, setDayTypes] = useState<Record<string, DayType>>({});
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>([]);
  const [weeklyHalfDays, setWeeklyHalfDays] = useState<number[]>([]);
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [dialogDate, setDialogDate] = useState<Date | null>(null);

  useEffect(() => {
    api.listAcademicSessions().then((list) => {
      setSessions(list);
      setSessionId((current) => current || list.find((s) => s.is_current)?.id || list[0]?.id || "");
    });
  }, []);

  const session = sessions.find((s) => s.id === sessionId);

  const refresh = useCallback(() => {
    if (!selectedBranchId || !session) return;
    api.getSchoolCalendar(selectedBranchId, session.id).then((data) => {
      setCalendar(data);
      setWeeklyOffDays(data.weekly_off_days);
      setWeeklyHalfDays(data.weekly_half_days);
    });
    api.getDayTypes(selectedBranchId, session.start_date.slice(0, 10), session.end_date.slice(0, 10)).then(setDayTypes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, session?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSaveRule = async () => {
    if (!selectedBranchId || !session) return;
    setIsSavingRule(true);
    try {
      await api.setWeeklyRule({
        branch_id: selectedBranchId,
        academic_session_id: session.id,
        weekly_off_days: weeklyOffDays,
        weekly_half_days: weeklyHalfDays,
      });
      refresh();
    } finally {
      setIsSavingRule(false);
    }
  };

  const toggleOff = (day: number) => {
    setWeeklyOffDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
    setWeeklyHalfDays((prev) => prev.filter((d) => d !== day));
  };
  const toggleHalf = (day: number) => {
    setWeeklyHalfDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
    setWeeklyOffDays((prev) => prev.filter((d) => d !== day));
  };

  const holidayDates: Date[] = [];
  const halfDayDates: Date[] = [];
  for (const [iso, dayType] of Object.entries(dayTypes)) {
    const d = parseISO(iso);
    if (dayType === "holiday") holidayDates.push(d);
    else if (dayType === "half_day") halfDayDates.push(d);
  }

  const namedHolidayByDate = new Map((calendar?.holidays ?? []).map((h) => [h.date.slice(0, 10), h]));
  const sortedHolidays = (calendar?.holidays ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));

  if (!selectedBranchId) {
    return <p className="text-muted-foreground">Select a branch to manage its calendar.</p>;
  }
  if (!session) {
    return <p className="text-muted-foreground">Create an academic session first.</p>;
  }

  const rangeStart = startOfMonth(parseISO(session.start_date.slice(0, 10)));
  const rangeEnd = endOfMonth(parseISO(session.end_date.slice(0, 10)));
  const numberOfMonths = Math.max(1, differenceInCalendarMonths(rangeEnd, rangeStart) + 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Academic session</Label>
        <Select value={sessionId} onValueChange={setSessionId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select session" />
          </SelectTrigger>
          <SelectContent>
            {sessions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly rule</CardTitle>
          <p className="text-sm text-muted-foreground">
            Days that are always off or always a half-day for the whole session, e.g. every Sunday off and every
            Saturday a half-day. A named date below always overrides this rule for that specific day.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">Always off</p>
              <div className="flex flex-wrap gap-3">
                {WEEKDAY_LABELS.map((label, day) => (
                  <label key={day} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input"
                      checked={weeklyOffDays.includes(day)}
                      disabled={!canManage}
                      onChange={() => toggleOff(day)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Always half-day</p>
              <div className="flex flex-wrap gap-3">
                {WEEKDAY_LABELS.map((label, day) => (
                  <label key={day} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input"
                      checked={weeklyHalfDays.includes(day)}
                      disabled={!canManage}
                      onChange={() => toggleHalf(day)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          {canManage && (
            <div>
              <Button onClick={handleSaveRule} disabled={isSavingRule}>
                {isSavingRule ? "Saving..." : "Save weekly rule"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calendar</CardTitle>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-destructive/25" /> Holiday
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-warning/30" /> Half-day
            </span>
            {canManage && <span>Click a date to name it as a holiday or half-day.</span>}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <DayPicker
            numberOfMonths={numberOfMonths}
            startMonth={rangeStart}
            endMonth={rangeEnd}
            defaultMonth={rangeStart}
            showOutsideDays={false}
            modifiers={{ holiday: holidayDates, halfDay: halfDayDates }}
            modifiersClassNames={{
              holiday: "!bg-destructive/20 !text-destructive rounded-md",
              halfDay: "!bg-warning/25 !text-warning-foreground rounded-md",
            }}
            onDayClick={(day) => canManage && setDialogDate(day)}
            className={canManage ? "cursor-pointer" : undefined}
            style={
              {
                "--rdp-accent-color": "var(--primary)",
                "--rdp-accent-background-color": "var(--accent)",
                "--rdp-today-color": "var(--primary)",
              } as React.CSSProperties
            }
          />
        </CardContent>
      </Card>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedHolidays.map((h) => (
              <TableRow key={h.id}>
                <TableCell>{h.date.slice(0, 10)}</TableCell>
                <TableCell className="font-medium">{h.name}</TableCell>
                <TableCell>
                  <Badge variant={h.type === "holiday" ? "destructive" : "warning"}>
                    {h.type === "holiday" ? "Full holiday" : "Half day"}
                  </Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-1">
                  {canManage && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setDialogDate(parseISO(h.date.slice(0, 10)))}>
                        <PencilIcon className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (!window.confirm(`Remove holiday "${h.name}"?`)) return;
                          await api.deleteHoliday(h.id);
                          refresh();
                        }}
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {sortedHolidays.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No named holidays yet for this session.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {dialogDate && (
        <HolidayDialog
          branchId={selectedBranchId}
          sessionId={session.id}
          date={dialogDate}
          existing={namedHolidayByDate.get(format(dialogDate, "yyyy-MM-dd"))}
          onClose={() => setDialogDate(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

export function AcademicSetupPage() {
  const hasPermission = useAppStore((s) => s.hasPermission);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Academic Setup</h1>
        <p className="text-muted-foreground">
          School calendar, student promotion, and branch details. Classes, sessions, subjects, and other lookup
          lists now live under Master Data.
        </p>
      </div>
      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">School Calendar</TabsTrigger>
          <TabsTrigger value="promotion">Promotion</TabsTrigger>
          {hasPermission("academic_setup.manage_school_details") && (
            <TabsTrigger value="school">School Details</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="calendar">
          <SchoolCalendarTab />
        </TabsContent>
        <TabsContent value="promotion">
          <PromotionTab />
        </TabsContent>
        {hasPermission("academic_setup.manage_school_details") && (
          <TabsContent value="school">
            <SchoolDetailsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
