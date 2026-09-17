import { IsOptional, IsString } from "class-validator";

// Optional upper bound for monthly/quarterly generation -- e.g. "Mar 2027"
// to generate every period from session start through that month in one
// call ("generate the whole session's invoices at once"). Ignored for
// one_time/annual structures, which always produce a single invoice.
export class GenerateInvoicesDto {
  @IsOptional()
  @IsString()
  up_to_period?: string;
}
