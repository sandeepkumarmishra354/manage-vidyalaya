import { useEffect, useState } from "react";
import { UsersIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type StudentListItem } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardPage() {
  const session = useAppStore((s) => s.session);
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [students, setStudents] = useState<StudentListItem[]>([]);

  useEffect(() => {
    if (!selectedBranchId) return;
    api.listStudents(selectedBranchId).then(setStudents);
  }, [selectedBranchId]);

  const enrolled = students.filter((s) => s.status === "enrolled").length;
  const applied = students.filter((s) => s.status === "applied").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back, {session?.full_name?.split(" ")[0]}</h1>
        <p className="text-muted-foreground">Here's what's happening at this branch today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Students
            </CardTitle>
            <UsersIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{students.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Enrolled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{enrolled}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Applications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{applied}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
