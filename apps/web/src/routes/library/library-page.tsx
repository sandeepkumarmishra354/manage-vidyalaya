import { useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon, SearchIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type LibraryBook, type LibraryIssueListItem, type StudentListItem } from "@/lib/api";
import { formatDate } from "@/lib/date";
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

function EditBookDialog({ book, onUpdated }: { book: LibraryBook; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author ?? "");
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
        isbn: book.isbn,
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
        isbn: null,
        category: null,
        total_copies: Number(copies) || 1,
      });
      setTitle("");
      setAuthor("");
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
        <Input placeholder="Search by title or author..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Available</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {books.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.title}</TableCell>
                <TableCell>{b.author ?? "—"}</TableCell>
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
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = useCallback(() => {
    if (selectedBranchId) {
      api.listIssues(selectedBranchId, "issued").then(setIssues);
      api.listStudents(selectedBranchId).then((list) => setStudents(list.filter((s) => s.status === "enrolled")));
    }
  }, [selectedBranchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookId || !studentId) return;
    setIsSubmitting(true);
    try {
      await api.issueBook(bookId, studentId, inDays(14));
      setBookId("");
      setStudentId("");
      refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturn = async (issueId: string) => {
    await api.returnBook(issueId);
    refresh();
  };

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
            <Button type="submit" disabled={isSubmitting || !bookId || !studentId}>
              Issue (14-day due)
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
              <TableRow key={issue.id}>
                <TableCell className="font-medium">{issue.book_title}</TableCell>
                <TableCell>{issue.student_name}</TableCell>
                <TableCell>{formatDate(issue.due_date)}</TableCell>
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
        <p className="text-muted-foreground">Book catalog and issue/return tracking.</p>
      </div>
      <Tabs defaultValue="issues">
        <TabsList>
          <TabsTrigger value="issues">Issue / Return</TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
        </TabsList>
        <TabsContent value="issues">
          <IssuesTab books={books} />
        </TabsContent>
        <TabsContent value="catalog">
          <CatalogTab onChanged={() => setRefreshKey((k) => k + 1)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
