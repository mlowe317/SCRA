import { beforeAll, describe, expect, it } from "vitest";
import { buildMrrFile, buildMrrRecord, sanitizeName } from "./request";
import { parseActiveDutyFlag, parseDmdcResponse } from "./response";
import { MRR_REQUEST_RECORD_LENGTH } from "./layout";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "0".repeat(63) + "1";
});

const person = {
  ssn: "123-45-6789",
  dateOfBirth: new Date("1990-05-04T00:00:00Z"),
  lastName: "O'Brien-Núñez",
  firstName: "José",
  middleName: "A.",
  customerRecordId: "cmborrower000000000000001",
};
const statusDate = new Date("2026-10-21T00:00:00Z");

describe("MRR request", () => {
  it("builds a fixed-width record in documented columns", () => {
    const rec = buildMrrRecord(person, statusDate);
    expect(rec).toHaveLength(MRR_REQUEST_RECORD_LENGTH);
    expect(rec.slice(0, 9)).toBe("123456789");
    expect(rec.slice(9, 17)).toBe("19900504");
    expect(rec.slice(17, 43).trimEnd()).toBe("O'BRIEN-NUNEZ");
    expect(rec.slice(43, 63).trimEnd()).toBe("JOSE");
    expect(rec.slice(63, 91).trimEnd()).toBe(person.customerRecordId);
    expect(rec.slice(91, 111).trimEnd()).toBe("A");
    expect(rec.slice(111, 119)).toBe("20261021");
  });

  it("truncates long names and leaves DOB blank when unknown", () => {
    const rec = buildMrrRecord({ ...person, lastName: "X".repeat(40), dateOfBirth: null }, statusDate);
    expect(rec.slice(9, 17)).toBe(" ".repeat(8));
    expect(rec.slice(17, 43)).toBe("X".repeat(26));
  });

  it("joins records with CRLF", () => {
    expect(buildMrrFile([person, person], statusDate).split("\r\n")).toHaveLength(3);
    expect(buildMrrFile([], statusDate)).toBe("");
  });

  it("sanitizes names", () => {
    expect(sanitizeName("  mary   ann  ")).toBe("MARY ANN");
  });
});

describe("DMDC response", () => {
  it("parses a CSV result file by header", () => {
    const csv = [
      "SSN,Customer Record ID,Last Name,Active Duty Status Date,Active Duty Status,Active Duty Start Date,Active Duty End Date,Certificate ID",
      "123456789,cmb1,DOE,20261021,Yes,20240601,,ABC123",
      ",cmb2,ROE,20261021,No,,,DEF456",
      "bad,,X,20261021,Yes,,,",
      "987654321,,X,20261021,Maybe,,,",
    ].join("\n");
    const r = parseDmdcResponse(csv);
    expect(r.format).toBe("delimited");
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ ssn: "123456789", activeDuty: true, certificateNumber: "ABC123" });
    expect(r.rows[0].activeDutyStartDate?.toISOString().slice(0, 10)).toBe("2024-06-01");
    expect(r.rows[1]).toMatchObject({ ssn: null, customerRecordId: "cmb2", activeDuty: false });
    expect(r.errors.map((e) => e.line)).toEqual([4, 5]);
  });

  it("parses pipe-delimited .txt results", () => {
    const r = parseDmdcResponse("SSN|Active Duty Status|Active Duty Start Date\n123456789|Y|06/01/2024\n");
    expect(r.rows[0]).toMatchObject({ activeDuty: true });
  });

  it("parses fixed-width results using the response layout", () => {
    const echo = buildMrrRecord(person, statusDate);
    const line = echo + "20240601" + "        " + "Y" + "CERT-0001".padEnd(20);
    const r = parseDmdcResponse(line + "\r\nshort\r\n");
    expect(r.format).toBe("fixed-width");
    expect(r.rows[0]).toMatchObject({
      ssn: "123456789",
      customerRecordId: person.customerRecordId,
      activeDuty: true,
      activeDutyEndDate: null,
      certificateNumber: "CERT-0001",
    });
    expect(r.errors).toEqual([{ line: 2, message: "line is too short to be a DMDC result record" }]);
  });

  it("fails clearly when no status column exists", () => {
    expect(parseDmdcResponse("SSN,Name\n123456789,X").fatal).toMatch(/active duty status/);
  });

  it("reads yes/no flags", () => {
    expect(parseActiveDutyFlag("YES")).toBe(true);
    expect(parseActiveDutyFlag("n")).toBe(false);
    expect(parseActiveDutyFlag("?")).toBeNull();
  });
});
