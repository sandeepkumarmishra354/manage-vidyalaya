import { useCallback, useEffect, useState } from "react";
import { BookOpenIcon, BookmarkIcon, ClockAlertIcon, PencilIcon, PlusIcon, SearchIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type LibraryBook, type LibraryIssueListItem, type LibraryStats, type StudentListItem } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { PersonLink } from "@/components/person-link";
import { IconTile } from "@/components/icon-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const LIBRARY_ACCENT = "var(--color-services)";
const ALL = "__all__";

function StatTile({
  icon,
  label,
  value,
  accent = LIBRARY_ACCENT,
}: {
  icon: typeof BookOpenIcon;
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundImage: `linear-gradient(90deg, ${accent}, color-mix(in oklch, ${accent} 40%, transparent))` }}
      />
      <CardContent className="flex items-center gap-4 pt-6">
        <IconTile icon={icon} accent={accent} size="md" />
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EditBookDialog({ book, onUpdated }: { book: LibraryBook; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author ?? "");
  const [isbn, setIsbn] = useState(book.isbn ?? "");
  const [totalCopies, setTotalCopies] = useState(String(book.total_copies));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.updateBook({
        id: book.id,
        title,
        author: author || null,
        isbn: isbn || null,
        category: book.category,
        total_copies: Number(totalCopies),
      });
      setOpen(false);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><PencilIcon className="size-3.5" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit book</DialogTitle></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Author</Label>
            <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>ISBN</Label>
            <Input value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="Optional" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Total copies</Label>
            <Input type="number" min="0" value={totalCopies} onChange={(e) => setTotalCopies(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function inDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function CatalogTab({ onChanged }: { onChanged: () => void }) {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManageCatalog = hasPermission("library.manage_catalog");
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [isbn, setIsbn] = useState("");
  const [copies, setCopies] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = useCallback(() => {
    if (selectedBranchId) api.listBooks(selectedBranchId, search).then(setBooks);
  }, [selectedBranchId, search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId) return;
    setIsSubmitting(true);
    try {
      await api.createBook({
        branch_id: selectedBranchId,
        title,
        author: author || null,
        isbn: isbn || null,
        category: null,
        total_copies: Number(copies) || 1,
      });
      setTitle("");
      setAuthor("");
      setIsbn("");
      setCopies("1");
      refresh();
      onChanged();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {canManageCatalog && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add book</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" onSubmit={handleCreate}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="book-title">Title</Label>
              <Input id="book-title" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-56" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="book-author">Author</Label>
              <Input id="book-author" value={author} onChange={(e) => setAuthor(e.target.value)} className="w-48" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="book-isbn">ISBN</Label>
              <Input
                id="book-isbn"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="Optional"
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="book-copies">Copies</Label>
              <Input
                id="book-copies"
                type="number"
                min="1"
                value={copies}
                onChange={(e) => setCopies(e.target.value)}
                className="w-24"
              />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              <PlusIcon />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      <div className="relative max-w-sm">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by title, author, or ISBN..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>ISBN</TableHead>
              <TableHead>Available</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {books.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.title}</TableCell>
                <TableCell>{b.author ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{b.isbn ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={b.available_copies > 0 ? "success" : "destructive"}>
                    {b.available_copies} / {b.total_copies}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canManageCatalog && <EditBookDialog book={b} onUpdated={refresh} />}
                </TableCell>
              </TableRow>
            ))}
            {books.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No books yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function IssuesTab({ books }: { books: LibraryBook[] }) {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManageIssues = hasPermission("library.manage_issues");
  const [issues, setIssues] = useState<LibraryIssueListItem[]>([]);
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [bookId, setBookId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [dueDate, setDueDate] = useState(inDays(14));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = useCallback(() => {
    if (selectedBranchId) {
      api.listIssues(selectedBranchId, { status: "issued" }).then(setIssues);
      api.listStudents(selectedBranchId).then((list) => setStudents(list.filter((s) => s.status === "enrolled")));
    }
  }, [selectedBranchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookId || !studentId || !dueDate) return;
    setIsSubmitting(true);
    try {
      await api.issueBook(bookId, studentId, dueDate);
      setBookId("");
      setStudentId("");
      setDueDate(inDays(14));
      refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturn = async (issueId: string) => {
    await api.returnBook(issueId);
    refresh();
  };

  const isOverdue = (issue: LibraryIssueListItem) => issue.status === "issued" && new Date(issue.due_date) < new Date();

  return (
    <div className="flex flex-col gap-4">
      {canManageIssues && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Issue a book</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" onSubmit={handleIssue}>
            <div className="flex flex-col gap-1.5">
              <Label>Book</Label>
              <Select value={bookId} onValueChange={setBookId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select book" />
                </SelectTrigger>
                <SelectContent>
                  {books
                    .filter((b) => b.available_copies > 0)
                    .map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.title} ({b.available_copies} available)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name ?? ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-40" />
            </div>
            <Button type="submit" disabled={isSubmitting || !bookId || !studentId}>
              Issue
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Book</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Due</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.map((issue) => (
              <TableRow key={issue.id} className={isOverdue(issue) ? "bg-destructive/5" : undefined}>
                <TableCell className="font-medium">{issue.book_title}</TableCell>
                <TableCell>
                  <PersonLink type="student" id={issue.student_id} name={issue.student_name} />
                </TableCell>
                <TableCell>
                  {formatDate(issue.due_date)}
                  {isOverdue(issue) && (
                    <Badge variant="destructive" className="ml-2 gap-1">
                      <ClockAlertIcon className="size-3" />
                      Overdue
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {canManageIssues && (
                    <Button variant="outline" size="sm" onClick={() => handleReturn(issue.id)}>
                      Mark returned
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {issues.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No books currently issued.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function HistoryReportsTab({ selectedBranchId }: { selectedBranchId: string | null }) {
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [issues, setIssues] = useState<LibraryIssueListItem[]>([]);
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [status, setStatus] = useState(ALL);
  const [studentId, setStudentId] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (selectedBranchId) {
      api.getLibraryStats(selectedBranchId).then(setStats);
      api.listStudents(selectedBranchId).then(setStudents);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    if (!selectedBranchId) return;
    api
      .listIssues(selectedBranchId, {
        status: status === ALL ? undefined : status,
        student_id: studentId === ALL ? undefined : studentId,
        from: from || undefined,
        to: to || undefined,
      })
      .then(setIssues);
  }, [selectedBranchId, status, studentId, from, to]);

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatTile icon={BookOpenIcon} label="Titles" value={stats.total_books} />
          <StatTile icon={BookmarkIcon} label="Total copies" value={stats.total_copies} />
          <StatTile icon={BookOpenIcon} label="Available now" value={stats.available_copies} accent="var(--color-success)" />
          <StatTile icon={BookOpenIcon} label="Currently issued" value={stats.issued_count} accent="var(--color-info)" />
          <StatTile icon={ClockAlertIcon} label="Overdue" value={stats.overdue_count} accent="var(--color-destructive)" />
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
                <SelectItem value="returned">Returned</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Student</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All students</SelectItem>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.first_name} {s.last_name ?? ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Book</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Returned</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.map((issue) => (
              <TableRow key={issue.id}>
                <TableCell className="font-medium">{issue.book_title}</TableCell>
                <TableCell>
                  <PersonLink type="student" id={issue.student_id} name={issue.student_name} />
                </TableCell>
                <TableCell>{formatDate(issue.issued_date)}</TableCell>
                <TableCell>{formatDate(issue.due_date)}</TableCell>
                <TableCell>{issue.returned_date ? formatDate(issue.returned_date) : "—"}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      issue.status === "returned" ? "success" : issue.status === "lost" ? "destructive" : "outline"
                    }
                  >
                    {issue.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {issues.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No issue history matches these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function LibraryPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (selectedBranchId) api.listBooks(selectedBranchId).then(setBooks);
  }, [selectedBranchId, refreshKey]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Library</h1>
        <p className="text-muted-foreground">Book catalog, issue/return tracking, and reporting.</p>
      </div>
      <Tabs defaultValue="issues">
        <TabsList>
          <TabsTrigger value="issues">Issue / Return</TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="reports">History &amp; Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="issues">
          <IssuesTab books={books} />
        </TabsContent>
        <TabsContent value="catalog">
          <CatalogTab onChanged={() => setRefreshKey((k) => k + 1)} />
        </TabsContent>
        <TabsContent value="reports">
          <HistoryReportsTab selectedBranchId={selectedBranchId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
