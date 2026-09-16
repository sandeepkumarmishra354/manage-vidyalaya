import { useParams } from "react-router-dom";
import { UsersIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DetailSection } from "@/components/detail-section";
import { PersonLink } from "@/components/person-link";
import { ProfileHeader } from "@/components/profile-header";

export function GuardianDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: guardian } = useQuery({
    queryKey: ["guardian", id],
    queryFn: () => api.getGuardian(id!),
    enabled: !!id,
  });

  if (!guardian) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="flex flex-col gap-4">
      <ProfileHeader
        icon={UsersIcon}
        accent="var(--color-academics)"
        name={guardian.full_name}
        facts={[
          ...(guardian.relation ? [{ label: "Relation", value: guardian.relation }] : []),
          ...(guardian.phone ? [{ label: "Phone", value: guardian.phone }] : []),
          ...(guardian.occupation ? [{ label: "Occupation", value: guardian.occupation }] : []),
        ]}
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="children">Children</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <DetailSection
            title="Contact details"
            icon={UsersIcon}
            accent="var(--color-academics)"
            fields={[
              { label: "Full name", value: guardian.full_name },
              { label: "Relation", value: guardian.relation ?? "—" },
              { label: "Phone", value: guardian.phone ?? "—" },
              { label: "Alternate phone", value: guardian.alt_phone ?? "—" },
              { label: "Email", value: guardian.email ?? "—" },
              { label: "Occupation", value: guardian.occupation ?? "—" },
              { label: "Address", value: guardian.address ?? "—", span: true },
              { label: "Aadhaar number", value: guardian.aadhaar_number ?? "—" },
              {
                label: "Annual income",
                value:
                  guardian.annual_income != null
                    ? new Intl.NumberFormat("en-IN", {
                        style: "currency",
                        currency: "INR",
                        maximumFractionDigits: 0,
                      }).format(guardian.annual_income)
                    : "—",
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="children">
          <DetailSection title="Children" icon={UsersIcon} accent="var(--color-academics)">
            <div className="flex flex-col gap-2">
              {guardian.children.length === 0 && (
                <p className="text-muted-foreground">No children linked to this guardian.</p>
              )}
              {guardian.children.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">
                      <PersonLink type="student" id={c.id} name={[c.first_name, c.last_name].filter(Boolean).join(" ")} />
                    </p>
                    <p className="text-muted-foreground">
                      {[c.class_name, c.section_name].filter(Boolean).join(" · ") || c.admission_number || "—"}
                    </p>
                  </div>
                  <Badge variant="outline">{c.status}</Badge>
                </div>
              ))}
            </div>
          </DetailSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}
