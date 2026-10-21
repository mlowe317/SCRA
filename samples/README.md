Sample files with **fake** borrowers and SSNs (123-45-67xx), for local testing only.

- `loans-sample.csv`: upload on the Import / Export page.
- `dmdc-results-sample.csv`: drop on the Batch SCRA page. A mock DMDC results file for the same borrowers. Real DMDC
  results echo the Customer Record ID from the request file; this mock matches on SSN only.
  Expected after import: loan 100001 eligible (service began 2024-01-08, after origination),
  100002 not (originated after service began), 100003 not (rate below 6%),
  100004 eligible, 100005 not (not on active duty).
