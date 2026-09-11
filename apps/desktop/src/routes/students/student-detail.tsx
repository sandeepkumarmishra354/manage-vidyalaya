import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api, type StudentDetail } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<StudentDetail | null>(null);

  useEffect(() => {
    if (id) api.getStudent(id).then(setStudent);
  }, [id]);

  if (!student) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {student.first_name} {student.last_name ?? ""}
        </h1>
        <Badge>{student.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Student details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
          <Field label="Admission number" value={student.admission_number ?? "Not yet assigned"} />
          <Field label="Date of birth" value={student.date_of_birth ?? "—"} />
          <Field label="Gender" value={student.gender ?? "—"} />
          <Field label="Address" value={student.address ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Guardians</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {student.guardians.length === 0 && (
            <p className="text-muted-foreground">No guardians on record.</p>
          )}
          {student.guardians.map((g, i) => (
            <div key={g.id}>
              {i > 0 && <Separator className="my-3" />}
              <div className="flex items-center justify-between">
                <p className="font-medium">{g.full_name}</p>
                <Badge variant="outline">{g.relation}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {g.phone ?? "—"} {g.email ? `· ${g.email}` : ""}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
