import type { APIRequestContext } from "@playwright/test";

import { getBranchIdByName, getCurrentAcademicSessionId, getStaffIdByEmployeeCode } from "./api-client.js";

async function clearExistingClassTeacherAssignment(api: APIRequestContext, branchId: string, staffId: string): Promise<void> {
  const classesRes = await api.get(`/classes?branch_id=${branchId}`);
  if (!classesRes.ok()) return;
  const classes = (await classesRes.json()) as { id: string }[];

  for (const cls of classes) {
    const sectionsRes = await api.get(`/sections?class_id=${cls.id}`);
    if (!sectionsRes.ok()) continue;
    const sections = (await sectionsRes.json()) as { id: string; class_teacher_staff_id: string | null }[];
    for (const section of sections) {
      if (section.class_teacher_staff_id === staffId) {
        await api.patch(`/sections/${section.id}/class-teacher`, { data: { staff_id: null } });
      }
    }
  }
}

export interface AcademicFixture {
  branchId: string;
  sessionId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
  classTeacherStaffId: string;
  subjectTeacherStaffId: string;
}

// Builds one small, real class/section/subject structure in North Campus
// and wires the two QA teacher personas into it (class-teacher-of-the-
// section, and subject-assigned-teacher-of-that-subject/class) so
// ScopedAccessService's additive authorization paths have real data to
// exercise in the attendance/exams/timetable tests, not just the flat
// `teacher` permission set. Uses a super_admin-authenticated api context
// (passed in) since it touches academic_setup.manage_* + staff.manage_
// assignments permissions, all of which super_admin holds.
export async function setupAcademicFixture(api: APIRequestContext, uniqueSuffix: number): Promise<AcademicFixture> {
  const branchId = await getBranchIdByName(api, "North Campus");
  const sessionId = await getCurrentAcademicSessionId(api);
  const classTeacherStaffId = await getStaffIdByEmployeeCode(api, branchId, "QA-CT-01");
  const subjectTeacherStaffId = await getStaffIdByEmployeeCode(api, branchId, "QA-ST-01");

  const classRes = await api.post("/classes", {
    data: { branch_id: branchId, academic_session_id: sessionId, name: `E2E Class ${uniqueSuffix}` },
  });
  if (!classRes.ok()) throw new Error(`POST /classes failed: ${classRes.status()} ${await classRes.text()}`);
  const { id: classId } = (await classRes.json()) as { id: string };

  const sectionRes = await api.post("/sections", { data: { class_id: classId, name: "A" } });
  if (!sectionRes.ok()) throw new Error(`POST /sections failed: ${sectionRes.status()} ${await sectionRes.text()}`);
  const { id: sectionId } = (await sectionRes.json()) as { id: string };

  const subjectRes = await api.post("/subjects", { data: { branch_id: branchId, name: `E2E Subject ${uniqueSuffix}` } });
  if (!subjectRes.ok()) throw new Error(`POST /subjects failed: ${subjectRes.status()} ${await subjectRes.text()}`);
  const { id: subjectId } = (await subjectRes.json()) as { id: string };

  const linkRes = await api.post(`/classes/${classId}/subjects`, { data: { subject_id: subjectId } });
  if (!linkRes.ok()) throw new Error(`POST /classes/:id/subjects failed: ${linkRes.status()} ${await linkRes.text()}`);

  // A staff member can be class teacher of only one section at a time
  // (server-enforced exclusivity) -- clear any leftover assignment from a
  // prior test run before assigning this persona to the fresh section
  // this run just created, so this fixture stays safely re-runnable.
  await clearExistingClassTeacherAssignment(api, branchId, classTeacherStaffId);

  const classTeacherRes = await api.patch(`/sections/${sectionId}/class-teacher`, {
    data: { staff_id: classTeacherStaffId },
  });
  if (!classTeacherRes.ok()) {
    throw new Error(`PATCH class-teacher failed: ${classTeacherRes.status()} ${await classTeacherRes.text()}`);
  }

  const assignmentRes = await api.post("/teacher-assignments", {
    data: {
      branch_id: branchId,
      staff_id: subjectTeacherStaffId,
      class_id: classId,
      section_id: sectionId,
      subject_id: subjectId,
      academic_session_id: sessionId,
    },
  });
  if (!assignmentRes.ok()) {
    throw new Error(`POST /teacher-assignments failed: ${assignmentRes.status()} ${await assignmentRes.text()}`);
  }

  return { branchId, sessionId, classId, sectionId, subjectId, classTeacherStaffId, subjectTeacherStaffId };
}
