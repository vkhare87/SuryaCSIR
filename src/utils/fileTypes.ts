// Kept apart from dataMigration.ts so dashboard code can name upload domains
// without pulling xlsx/papaparse/zod into the startup bundle.

export type FileType = 'staff' | 'divisions' | 'projects' | 'projectStaff' | 'phd' | 'equipment' | 'contractStaff';

/** Human-facing entity names, shared by the import flow and the builder wizard. */
export const FILE_TYPE_LABELS: Record<FileType, string> = {
  staff:         'Human Capital (Staff Directory)',
  divisions:     'Divisions',
  projects:      'Research Projects',
  projectStaff:  'Project Staff',
  phd:           'PhD Scholars',
  equipment:     'Facilities / Equipment',
  contractStaff: 'Contract Staff',
};
