"""Seed clearly-labelled DEMO rows for the dissertation demo.

Every row this writes is prefixed DEMO- (or names a DEMO- partner) so it is
distinguishable at a glance from real institute records, and so the rollback
below can remove all of it without touching anything real.

    python scripts/seed_demo_presentation.py           # insert
    python scripts/seed_demo_presentation.py --rollback # remove every DEMO- row

Deliberately does NOT touch the 82 real projects: no invented expenditure is
written against a real institute record. The demo projects carry their own
sanctioned/utilised figures so the utilisation and comparables views have
something to render.
"""
import os
import sys
from datetime import date, timedelta
from pathlib import Path

RAG_ENV = Path(__file__).resolve().parent.parent / "rag" / ".env"


def load_env():
    for line in RAG_ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def client():
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


TODAY = date.today()


def d(days):
    return (TODAY + timedelta(days=days)).isoformat()


# 5 completed projects — comparables for proposal evaluation (UC-4), and the only
# rows in the system carrying a utilised amount.
#
# Deliberately booked as in-house CSIR work (FundType 'Grant-in-aid', sponsor 'CSIR').
# lib/intelligence/commercialisation.isExternallyFunded() treats any non-CSIR sponsor
# type as externally funded, so an 'Industry'/'Government' sponsor here would push
# demonstration money into the commercialisation strip's external-project count and
# value — figures quoted as real institute performance. In-house keeps that strip
# reporting only genuine records while these rows still serve as comparables.
PROJECTS = [
    ("DEMO-P-001", "Closed-cell aluminium foam panels for blast mitigation", "FMCD",
     "Grant-in-aid", "CSIR", "CSIR", 4200000, 3980000, -1460, -365, "Dr. R. Kumar"),
    ("DEMO-P-002", "Superplasticizer formulation for low-clinker concrete", "SCMD",
     "Grant-in-aid", "CSIR", "CSIR", 2750000, 2610000, -1095, -180, "Dr. S. Mehta"),
    ("DEMO-P-003", "Bamboo-reinforced polymer composite for rural housing", "SCMD",
     "Grant-in-aid", "CSIR", "CSIR", 3100000, 2950000, -1825, -545, "Dr. P. Nair"),
    ("DEMO-P-004", "MOF-decorated carbon foam for hydrogen storage", "IMPD",
     "Grant-in-aid", "CSIR", "CSIR", 5600000, 5410000, -1460, -240, "Dr. A. Verma"),
    ("DEMO-P-005", "Electrospun nanofibre membranes for arsenic removal", "EESD",
     "Grant-in-aid", "CSIR", "CSIR", 2300000, 2180000, -1280, -90, "Dr. M. Iyer"),
]

REPORTS = [
    ("DEMO-P-001", "Closed-cell aluminium foam panels for blast mitigation", "FMCD", "Y",
     "DEMO Y1 2024-25", "REVIEWED",
     "Panel density window narrowed to 0.4–0.6 g/cc; blast rig commissioned.",
     "M1 alloy selection complete. M2 foaming trials complete. M3 rig testing complete.",
     "Utilisation tracked against sanctioned outlay; no reallocation sought.",
     "Peak overpressure attenuation of 38% achieved against the 30% target.",
     "[DEMO DATA — created for dissertation demonstration, not an institute record]"),
    ("DEMO-P-002", "Superplasticizer formulation for low-clinker concrete", "SCMD", "H",
     "DEMO H1 2025-26", "REVIEWED",
     "Admixture dosage optimised; slump retention verified at 90 minutes.",
     "M1 synthesis complete. M2 field trial with partner complete.",
     "Within sanctioned outlay; consumables under budget.",
     "Clinker factor reduced by 18% at equal 28-day strength.",
     "[DEMO DATA — created for dissertation demonstration, not an institute record]"),
    ("DEMO-P-003", "Bamboo-reinforced polymer composite for rural housing", "SCMD", "Y",
     "DEMO Y2 2025-26", "SUBMITTED",
     "Durability testing under humid ageing in progress.",
     "M1 and M2 complete; M3 accelerated ageing at 70%.",
     "Utilisation in line with plan.",
     "Flexural strength retained above 85% after 1000 hours ageing.",
     "[DEMO DATA — created for dissertation demonstration, not an institute record]"),
    ("DEMO-P-004", "MOF-decorated carbon foam for hydrogen storage", "IMPD", "Q",
     "DEMO Q3 2025-26", "UNDER_REVIEW",
     "Gravimetric uptake improved; cycling stability under evaluation.",
     "M1 synthesis complete. M2 uptake characterisation complete. M3 cycling ongoing.",
     "Utilisation on track against sanctioned outlay.",
     "4.1 wt% uptake at 77 K; 200-cycle stability pending.",
     "[DEMO DATA — created for dissertation demonstration, not an institute record]"),
    ("DEMO-P-005", "Electrospun nanofibre membranes for arsenic removal", "EESD", "H",
     "DEMO H2 2025-26", "REVIEWED",
     "Field pilot at two sites completed; regeneration protocol established.",
     "M1 fabrication complete. M2 field pilot complete.",
     "Closed within sanctioned outlay.",
     "Arsenic reduced below 10 ppb across both pilot sites.",
     "[DEMO DATA — created for dissertation demonstration, not an institute record]"),
    ("DEMO-P-001", "Closed-cell aluminium foam panels for blast mitigation", "FMCD", "Q",
     "DEMO Q4 2024-25", "REVISION_REQUESTED",
     "Final characterisation pending reviewer clarification on test standard.",
     "M3 rig testing complete; reporting under revision.",
     "Utilisation closed.",
     "Awaiting confirmation of the applicable blast-test standard.",
     "[DEMO DATA — created for dissertation demonstration, not an institute record]"),
]

MOUS = [
    ("DEMO — Indian Institute of Technology, Indore", "Academic",
     "Joint research on lightweight structural materials", -720, 45, "Active", "FMCD"),
    ("DEMO — UltraTech Cement Limited", "Industry",
     "Sponsored research on low-clinker binder systems", -400, 75, "Active", "SCMD"),
    ("DEMO — Bhabha Atomic Research Centre", "Government",
     "Shared characterisation facility access", -900, 260, "Active", "IMPD"),
    ("DEMO — Fraunhofer IFAM, Bremen", "International",
     "Metal foam process exchange programme", -1100, 15, "Active", "FMCD"),
    ("DEMO — National Institute of Technology, Bhopal", "Academic",
     "PhD co-supervision and student internships", -1500, -30, "Expired", "EESD"),
    ("DEMO — Hindustan Zinc Limited", "Industry",
     "Waste-derived construction material evaluation", -300, 640, "Under Renewal", "SCMD"),
]


def insert(c, submitter):
    # Idempotent: project_reports and mous have no natural key to upsert on, so clear
    # any previous DEMO rows first. Re-running otherwise silently doubles them.
    c.table("project_reports").delete().like("project_no", "DEMO-%").execute()
    c.table("mous").delete().like("partner_name", "DEMO %").execute()

    proj_rows = [{
        "ProjectID": pid, "ProjectNo": pid, "ProjectName": name, "DivisionCode": div,
        "FundType": fund, "SponsorerName": sponsor, "SponsorerType": stype,
        "ProjectCategory": "R&D", "ProjectStatus": "Completed",
        "SanctionedCost": sanc, "UtilizedAmount": util,
        "StartDate": d(start), "CompletioDate": d(end),
        "PrincipalInvestigator": pi,
    } for pid, name, div, fund, sponsor, stype, sanc, util, start, end, pi in PROJECTS]
    c.table("projects").upsert(proj_rows, on_conflict="ProjectID").execute()
    print(f"projects   : {len(proj_rows)} DEMO rows")

    rep_rows = [{
        "project_no": pno, "project_name": pname, "division_code": div,
        "period_type": ptype, "period_label": label, "status": status,
        "objectives_progress": obj, "milestones": ms, "expenditure_summary": exp,
        "outcomes": out, "remarks": rem,
        "due_date": d(-60), "submitted_by": submitter, "submitted_at": d(-55) + "T10:00:00Z",
    } for pno, pname, div, ptype, label, status, obj, ms, exp, out, rem in REPORTS]
    c.table("project_reports").insert(rep_rows).execute()
    print(f"reports    : {len(rep_rows)} DEMO rows")

    mou_rows = [{
        "partner_name": pn, "partner_type": pt, "purpose": purpose,
        "signed_date": d(signed), "valid_until": d(until),
        "status": status, "division_code": div,
        "remarks": "[DEMO DATA — created for dissertation demonstration]",
    } for pn, pt, purpose, signed, until, status, div in MOUS]
    c.table("mous").insert(mou_rows).execute()
    print(f"mous       : {len(mou_rows)} DEMO rows")


def rollback(c):
    c.table("project_reports").delete().like("project_no", "DEMO-%").execute()
    print("reports    : DEMO rows deleted")
    c.table("mous").delete().like("partner_name", "DEMO %").execute()
    print("mous       : DEMO rows deleted")
    c.table("projects").delete().like("ProjectID", "DEMO-%").execute()
    print("projects   : DEMO rows deleted")


def main():
    load_env()
    c = client()
    if "--rollback" in sys.argv:
        rollback(c)
        return
    prof = c.table("user_profiles").select("user_id").limit(1).execute().data
    if not prof:
        raise SystemExit("no user_profiles row to attribute demo reports to")
    insert(c, prof[0]["user_id"])
    print("\nAll rows are DEMO-prefixed. Remove with: "
          "python scripts/seed_demo_presentation.py --rollback")


if __name__ == "__main__":
    main()
