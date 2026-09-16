import { Link } from "react-router-dom";

const PATH_PREFIX: Record<"student" | "staff" | "guardian", string> = {
  student: "students",
  staff: "staff",
  guardian: "guardians",
};

// Wraps a student/staff/guardian name in a link to their profile page
// (/students/:id, /staff/:id, /guardians/:id), for on-screen list/table
// views. Never use this inside a data-print-area block -- a printed
// document can't be clicked, so those stay plain text. Pass `newTab` when
// the link sits inside an in-progress form (e.g. an admission dialog) --
// navigating away in the same tab would lose whatever's been typed so far.
export function PersonLink({
  type,
  id,
  name,
  newTab = false,
}: {
  type: "student" | "staff" | "guardian";
  id: string;
  name: string;
  newTab?: boolean;
}) {
  return (
    <Link
      to={`/${PATH_PREFIX[type]}/${id}`}
      className="text-primary hover:underline"
      {...(newTab ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {name}
    </Link>
  );
}
