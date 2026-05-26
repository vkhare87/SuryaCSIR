export interface IrinsCitations {
  total?: number;
  h_index?: number;
  i10?: number;
  total_2013?: number;
  h_index_2013?: number;
  i10_2013?: number;
}

export interface IrinsExperience { period: string; role: string; division: string }
export interface IrinsQualification { year: string; degree: string; institution: string }
export interface IrinsAward { year: string; title: string; awarding_body: string }
export interface IrinsThesis { title: string; scholar: string; year: string; status: string }
export interface IrinsPatent { title: string; inventors: string[]; number: string; status: string; filing_date: string }
export interface IrinsPublication { title: string; authors: string[]; journal: string; year: string; doi: string; type: string }
export interface IrinsProject { title: string; funding_agency: string; status: string; role: string; budget: string; duration: string }

export interface IrinsProfile {
  name: string;
  designation: string;
  division: string;
  photo_url: string;
  academic_ids: { orcid: string; scopus: string; researcher_id: string; google_scholar: string };
  expertise: string[];
  citations: IrinsCitations;
  experience: IrinsExperience[];
  qualifications: IrinsQualification[];
  awards: IrinsAward[];
  theses: IrinsThesis[];
  professional_bodies: string[];
  projects: IrinsProject[];
  patents: IrinsPatent[];
  publications: IrinsPublication[];
  _meta: { parse_version: number; status: 'ok' | 'fetch_failed' | 'parse_empty'; synced_at: string };
}

export const PARSE_VERSION = 1;
