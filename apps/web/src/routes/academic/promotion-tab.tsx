import { useEffect, useState } from "react";
import { ArrowRightIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  type AcademicSession,
  type ClassMappingSuggestion,
  type PromotionBatch,
  type PromotionDecision,
  type SchoolClass,
} from "@/lib/api";
import { PersonLink } from "@/components/person-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const DECISION_OPTIONS: PromotionDecision[] = ["promote", "retain", "withdraw"];

export function PromotionTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [fromSessionId, setFromSessionId] = useState("");
  const [toSessionId, setToSessionId] = useState("");
  const [toClasses, setToClasses] = useState<SchoolClass[]>([]);
  const [suggestions, setSuggestions] = useState<ClassMappingSuggestion[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [batch, setBatch] = useState<PromotionBatch | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    api.listAcademicSessions().then(setSessions);
  }, []);

  useEffect(() => {
    if (toSessionId && selectedBranchId) api.listClasses(selectedBranchId).then((cs) => {
      // listClasses is branch-wide across sessions in this schema shape; filter client-side isn't
      // possible without session_id on the response, so just show all and let the mapping dropdown
      // include everything -- classes not in the target session simply won't be picked.
      setToClasses(cs);
    });
  }, [toSessionId, selectedBranchId]);

  const handleSuggest = async () => {
    if (!selectedBranchId || !fromSessionId || !toSessionId) return;
    const rows = await api.suggestClassMapping(selectedBranchId, fromSessionId, toSessionId);
    setSuggestions(rows);
    setMapping(Object.fromEntries(rows.filter((r) => r.suggested_to_class_id).map((r) => [r.from_class_id, r.suggested_to_class_id as string])));
    setBatch(null);
  };

  const handleCreateBatch = async () => {
    if (!selectedBranchId || !fromSessionId || !toSessionId) return;
    setIsWorking(true);
    try {
      const created = await api.createPromotionBatch({
        branch_id: selectedBranchId,
        from_session_id: fromSessionId,
        to_session_id: toSessionId,
        class_mapping: mapping,
      });
      setBatch(created);
    } finally {
      setIsWorking(false);
    }
  };

  const handleDecisionChange = async (itemId: string, decision: PromotionDecision) => {
    await api.setPromotionDecision({ batch_item_id: itemId, decision, to_class_id: null, to_section_id: null });
    if (batch) api.getPromotionBatch(batch.id).then(setBatch);
  };

  const handleExecute = async () => {
    if (!batch) return;
    if (!window.confirm(`Execute this promotion for ${batch.items.length} students? This cannot be undone.`)) return;
    setIsWorking(true);
    try {
      await api.executePromotionBatch(batch.id);
      const refreshed = await api.getPromotionBatch(batch.id);
      setBatch(refreshed);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Promote students to a new session</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>From session</Label>
              <Select value={fromSessionId} onValueChange={setFromSessionId}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Select session" /></SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <ArrowRightIcon className="mb-2 size-4 text-muted-foreground" />
            <div className="flex flex-col gap-1.5">
              <Label>To session</Label>
              <Select value={toSessionId} onValueChange={setToSessionId}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Select session" /></SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {hasPermission("academic_setup.promote") && (
              <Button onClick={handleSuggest} disabled={!fromSessionId || !toSessionId || fromSessionId === toSessionId}>
                Suggest class mapping
              </Button>
            )}
          </div>

          {suggestions.length > 0 && !batch && (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>From class</TableHead>
                      <TableHead>To class</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suggestions.map((s) => (
                      <TableRow key={s.from_class_id}>
                        <TableCell className="font-medium">{s.from_class_name}</TableCell>
                        <TableCell>
                          <Select
                            value={mapping[s.from_class_id] ?? ""}
                            onValueChange={(v) => setMapping((m) => ({ ...m, [s.from_class_id]: v }))}
                          >
                            <SelectTrigger className="w-48"><SelectValue placeholder="Withdraw / graduate" /></SelectTrigger>
                            <SelectContent>
                              {toClasses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button onClick={handleCreateBatch} disabled={isWorking} className="w-fit">
                {isWorking ? "Preparing..." : "Review students"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {batch && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {batch.items.length} students ·{" "}
              <Badge variant={batch.status === "completed" ? "success" : "warning"}>{batch.status}</Badge>
            </CardTitle>
            {batch.status === "draft" && hasPermission("academic_setup.promote") && (
              <Button onClick={handleExecute} disabled={isWorking}>
                {isWorking ? "Executing..." : "Execute promotion"}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Decision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batch.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <PersonLink type="student" id={item.student_id} name={item.student_name} />
                      </TableCell>
                      <TableCell>{item.from_class_name ?? "—"}</TableCell>
                      <TableCell>{item.decision === "promote" ? (item.to_class_name ?? "—") : "—"}</TableCell>
                      <TableCell>
                        <Select
                          value={item.decision}
                          onValueChange={(v) => handleDecisionChange(item.id, v as PromotionDecision)}
                          disabled={batch.status !== "draft"}
                        >
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DECISION_OPTIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
