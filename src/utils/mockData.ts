import type {
  DivisionInfo,
  StaffMember,
  ProjectInfo,
  ProjectStaff,
  PhDStudent,
  Equipment,
  ScientificOutput,
  IPIntelligence,
} from '../types';

export const mockDivisions: DivisionInfo[] = [
  {
    divCode: 'ARC',
    divName: 'Advanced Refractory Ceramics',
    divDescription: 'Research in refractory and ceramic materials for high-temperature applications',
    divResearchAreas: 'Refractories, Ceramics, High-Temperature Materials',
    divHoD: 'Dr. A. K. Sharma',
    divHoDID: 'S001',
    divSanctionedstrength: 25,
    divCurrentStrength: 21,
    divStatus: 'Active',
  },
  {
    divCode: 'EEC',
    divName: 'Energy & Environment',
    divDescription: 'Research on energy materials and environmental monitoring',
    divResearchAreas: 'Energy Materials, Environmental Monitoring, Green Technologies',
    divHoD: 'Dr. R. Mishra',
    divHoDID: 'S012',
    divSanctionedstrength: 20,
    divCurrentStrength: 18,
    divStatus: 'Active',
  },
  {
    divCode: 'BMS',
    divName: 'Biomaterials & Sensors',
    divDescription: 'Development of biomedical materials and sensor technologies',
    divResearchAreas: 'Biomaterials, Sensors, Medical Devices',
    divHoD: 'Dr. P. Singh',
    divHoDID: 'S025',
    divSanctionedstrength: 18,
    divCurrentStrength: 15,
    divStatus: 'Active',
  },
  {
    divCode: 'NST',
    divName: 'Nanomaterials & Surface Technology',
    divDescription: 'Nanomaterial synthesis and surface coating research',
    divResearchAreas: 'Nanomaterials, Surface Coatings, Thin Films',
    divHoD: 'Dr. S. Verma',
    divHoDID: 'S037',
    divSanctionedstrength: 22,
    divCurrentStrength: 19,
    divStatus: 'Active',
  },
];

export const mockStaff: StaffMember[] = [
  {
    ID: 'S001', LabCode: 'AMPRI', EmployeeType: 'Permanent', Name: 'Dr. A. K. Sharma',
    Designation: 'Chief Scientist', Group: 'Scientific', Division: 'ARC',
    DoAPP: '2000-01-15', DOJ: '2000-01-15', DOB: '1968-03-20', Cat: 'I',
    AppointmentType: 'Direct', Level: '7', CoreArea: 'Refractories', Expertise: 'High-Temp Ceramics',
    Email: 'aksharma@ampri.res.in', Ext: '201', VidwanID: 'VID001', ReportingID: 'D001',
    HighestQualification: 'PhD', Gender: 'Male',
  },
  {
    ID: 'S002', LabCode: 'AMPRI', EmployeeType: 'Permanent', Name: 'Dr. Priya Mehta',
    Designation: 'Senior Scientist', Group: 'Scientific', Division: 'ARC',
    DoAPP: '2005-07-10', DOJ: '2005-07-10', DOB: '1975-11-05', Cat: 'I',
    AppointmentType: 'Direct', Level: '6', CoreArea: 'Ceramics', Expertise: 'Oxide Ceramics',
    Email: 'pmehta@ampri.res.in', Ext: '202', VidwanID: 'VID002', ReportingID: 'S001',
    HighestQualification: 'PhD', Gender: 'Female',
  },
  {
    ID: 'S003', LabCode: 'AMPRI', EmployeeType: 'Permanent', Name: 'Rajesh Kumar',
    Designation: 'Technical Officer', Group: 'Technical', Division: 'ARC',
    DoAPP: '2010-03-01', DOJ: '2010-03-01', DOB: '1982-07-15', Cat: 'II',
    AppointmentType: 'Direct', Level: '4', CoreArea: 'Lab Operations', Expertise: 'XRD Analysis',
    Email: 'rkumar@ampri.res.in', Ext: '203', VidwanID: '', ReportingID: 'S001',
    HighestQualification: 'M.Sc.', Gender: 'Male',
  },
  {
    ID: 'S012', LabCode: 'AMPRI', EmployeeType: 'Permanent', Name: 'Dr. R. Mishra',
    Designation: 'Principal Scientist', Group: 'Scientific', Division: 'EEC',
    DoAPP: '2003-06-01', DOJ: '2003-06-01', DOB: '1970-09-12', Cat: 'I',
    AppointmentType: 'Direct', Level: '7', CoreArea: 'Energy Materials', Expertise: 'Fuel Cells',
    Email: 'rmishra@ampri.res.in', Ext: '212', VidwanID: 'VID012', ReportingID: 'D001',
    HighestQualification: 'PhD', Gender: 'Male',
  },
  {
    ID: 'S013', LabCode: 'AMPRI', EmployeeType: 'Permanent', Name: 'Dr. Sunita Tiwari',
    Designation: 'Scientist', Group: 'Scientific', Division: 'EEC',
    DoAPP: '2012-09-01', DOJ: '2012-09-01', DOB: '1984-02-28', Cat: 'I',
    AppointmentType: 'Direct', Level: '5', CoreArea: 'Environment', Expertise: 'Air Quality Monitoring',
    Email: 'stiwari@ampri.res.in', Ext: '213', VidwanID: 'VID013', ReportingID: 'S012',
    HighestQualification: 'PhD', Gender: 'Female',
  },
  {
    ID: 'S025', LabCode: 'AMPRI', EmployeeType: 'Permanent', Name: 'Dr. P. Singh',
    Designation: 'Chief Scientist', Group: 'Scientific', Division: 'BMS',
    DoAPP: '1998-11-10', DOJ: '1998-11-10', DOB: '1965-06-30', Cat: 'I',
    AppointmentType: 'Direct', Level: '7', CoreArea: 'Biomaterials', Expertise: 'Tissue Engineering',
    Email: 'psingh@ampri.res.in', Ext: '225', VidwanID: 'VID025', ReportingID: 'D001',
    HighestQualification: 'PhD', Gender: 'Male',
  },
  {
    ID: 'S037', LabCode: 'AMPRI', EmployeeType: 'Permanent', Name: 'Dr. S. Verma',
    Designation: 'Principal Scientist', Group: 'Scientific', Division: 'NST',
    DoAPP: '2006-04-15', DOJ: '2006-04-15', DOB: '1973-01-18', Cat: 'I',
    AppointmentType: 'Direct', Level: '7', CoreArea: 'Nanomaterials', Expertise: 'Carbon Nanomaterials',
    Email: 'sverma@ampri.res.in', Ext: '237', VidwanID: 'VID037', ReportingID: 'D001',
    HighestQualification: 'PhD', Gender: 'Female',
  },
  {
    ID: 'S038', LabCode: 'AMPRI', EmployeeType: 'Permanent', Name: 'Anil Gupta',
    Designation: 'Technical Officer', Group: 'Technical', Division: 'NST',
    DoAPP: '2008-08-20', DOJ: '2008-08-20', DOB: '1980-04-10', Cat: 'II',
    AppointmentType: 'Direct', Level: '4', CoreArea: 'Thin Films', Expertise: 'PVD Coatings',
    Email: 'agupta@ampri.res.in', Ext: '238', VidwanID: '', ReportingID: 'S037',
    HighestQualification: 'B.Tech', Gender: 'Male',
  },
  {
    ID: 'H001', LabCode: 'AMPRI', EmployeeType: 'Permanent', Name: 'Kavita Sharma',
    Designation: 'Administrative Officer', Group: 'Admin', Division: 'ARC',
    DoAPP: '2007-05-01', DOJ: '2007-05-01', DOB: '1979-08-22', Cat: 'III',
    AppointmentType: 'Direct', Level: '3', CoreArea: 'HR', Expertise: 'Personnel Management',
    Email: 'hr@ampri.res.in', Ext: '101', VidwanID: '', ReportingID: 'D001',
    HighestQualification: 'MBA', Gender: 'Female',
  },
];

export const mockProjects: ProjectInfo[] = [
  {
    ProjectID: 'P001', ProjectNo: 'OLP-2023-01', ProjectName: 'Development of High-Temperature Refractory Linings',
    FundType: 'In-House', SponsorerType: 'CSIR', SponsorerName: 'CSIR', ProjectCategory: 'R&D',
    ProjectStatus: 'Active', StartDate: '2023-04-01', CompletioDate: '2026-03-31',
    SanctionedCost: '5000000', UtilizedAmount: '2100000',
    PrincipalInvestigator: 'Dr. A. K. Sharma', DivisionCode: 'ARC',
    Extension: '', ApprovalAuthority: 'CSIR-HQ',
  },
  {
    ProjectID: 'P002', ProjectNo: 'EXP-2022-05', ProjectName: 'Fuel Cell Electrolyte Optimization',
    FundType: 'Extramural', SponsorerType: 'Government', SponsorerName: 'DST', ProjectCategory: 'R&D',
    ProjectStatus: 'Active', StartDate: '2022-01-01', CompletioDate: '2025-12-31',
    SanctionedCost: '8500000', UtilizedAmount: '6200000',
    PrincipalInvestigator: 'Dr. R. Mishra', DivisionCode: 'EEC',
    Extension: 'Yes', ApprovalAuthority: 'DST',
  },
  {
    ProjectID: 'P003', ProjectNo: 'CNS-2024-02', ProjectName: 'Biosensor for Heavy Metal Detection',
    FundType: 'Extramural', SponsorerType: 'Industry', SponsorerName: 'TCS', ProjectCategory: 'Consultancy',
    ProjectStatus: 'Active', StartDate: '2024-01-15', CompletioDate: '2025-06-30',
    SanctionedCost: '3200000', UtilizedAmount: '1800000',
    PrincipalInvestigator: 'Dr. P. Singh', DivisionCode: 'BMS',
    Extension: '', ApprovalAuthority: 'CSIR-AMPRI Director',
  },
  {
    ProjectID: 'P004', ProjectNo: 'NNO-2021-08', ProjectName: 'Carbon Nanotube Reinforced Composites',
    FundType: 'Extramural', SponsorerType: 'Government', SponsorerName: 'DRDO', ProjectCategory: 'R&D',
    ProjectStatus: 'Completed', StartDate: '2021-07-01', CompletioDate: '2024-06-30',
    SanctionedCost: '12000000', UtilizedAmount: '11800000',
    PrincipalInvestigator: 'Dr. S. Verma', DivisionCode: 'NST',
    Extension: '', ApprovalAuthority: 'DRDO',
  },
  {
    ProjectID: 'P005', ProjectNo: 'OLP-2024-03', ProjectName: 'Eco-Friendly Binder Systems for Ceramics',
    FundType: 'In-House', SponsorerType: 'CSIR', SponsorerName: 'CSIR', ProjectCategory: 'R&D',
    ProjectStatus: 'Active', StartDate: '2024-04-01', CompletioDate: '2027-03-31',
    SanctionedCost: '4500000', UtilizedAmount: '800000',
    PrincipalInvestigator: 'Dr. Priya Mehta', DivisionCode: 'ARC',
    Extension: '', ApprovalAuthority: 'CSIR-HQ',
  },
];

export const mockProjectStaff: ProjectStaff[] = [
  {
    id: 'PS001', ProjectNo: 'OLP-2023-01', StaffName: 'Ramesh Yadav',
    Designation: 'Project Assistant', RecruitmentCycle: '2023',
    DateOfJoining: '2023-06-01', DateOfProjectDuration: '2026-03-31', PIName: 'Dr. A. K. Sharma', DivisionCode: '',
  },
  {
    id: 'PS002', ProjectNo: 'EXP-2022-05', StaffName: 'Meena Patel',
    Designation: 'Junior Research Fellow', RecruitmentCycle: '2022',
    DateOfJoining: '2022-03-01', DateOfProjectDuration: '2025-02-28', PIName: 'Dr. R. Mishra', DivisionCode: '',
  },
  {
    id: 'PS003', ProjectNo: 'CNS-2024-02', StaffName: 'Vivek Joshi',
    Designation: 'Project Associate', RecruitmentCycle: '2024',
    DateOfJoining: '2024-02-01', DateOfProjectDuration: '2025-06-30', PIName: 'Dr. P. Singh', DivisionCode: '',
  },
  {
    id: 'PS004', ProjectNo: 'OLP-2024-03', StaffName: 'Anjali Dixit',
    Designation: 'Senior Research Fellow', RecruitmentCycle: '2024',
    DateOfJoining: '2024-05-01', DateOfProjectDuration: '2027-03-31', PIName: 'Dr. Priya Mehta', DivisionCode: '',
  },
];

export const mockPhDStudents: PhDStudent[] = [
  {
    EnrollmentNo: 'PHD2019001', StudentName: 'Arjun Nair', Specialization: 'Refractory Ceramics',
    SupervisorName: 'Dr. A. K. Sharma', CoSupervisorName: 'Dr. Priya Mehta',
    FellowshipDetails: 'SRF-CSIR', CurrentStatus: 'Thesis Submitted',
    ThesisTitle: 'Novel Castable Refractories for Steelmaking', ProjectNo: 'OLP-2023-01', DivisionCode: '',
  },
  {
    EnrollmentNo: 'PHD2021003', StudentName: 'Divya Kapoor', Specialization: 'Energy Materials',
    SupervisorName: 'Dr. R. Mishra', CoSupervisorName: 'None',
    FellowshipDetails: 'JRF-CSIR', CurrentStatus: 'Ongoing',
    ThesisTitle: 'SOFC Cathode Materials for Intermediate Temperature Operation', ProjectNo: 'EXP-2022-05', DivisionCode: '',
  },
  {
    EnrollmentNo: 'PHD2022005', StudentName: 'Karan Bose', Specialization: 'Nanomaterials',
    SupervisorName: 'Dr. S. Verma', CoSupervisorName: 'None',
    FellowshipDetails: 'SRF-UGC', CurrentStatus: 'Ongoing',
    ThesisTitle: 'Functionalized Carbon Nanotubes for Composite Reinforcement', ProjectNo: 'NNO-2021-08', DivisionCode: '',
  },
  {
    EnrollmentNo: 'PHD2023007', StudentName: 'Pooja Sharma', Specialization: 'Ceramics',
    SupervisorName: 'Dr. Priya Mehta', CoSupervisorName: 'Dr. A. K. Sharma',
    FellowshipDetails: 'JRF-DST', CurrentStatus: 'Coursework',
    ThesisTitle: 'Alumina-Zirconia Ceramics for Biomedical Applications', ProjectNo: '', DivisionCode: '',
  },
  {
    EnrollmentNo: 'PHD2020002', StudentName: 'Manish Tripathi', Specialization: 'Biomaterials',
    SupervisorName: 'Dr. P. Singh', CoSupervisorName: 'None',
    FellowshipDetails: 'SRF-ICMR', CurrentStatus: 'Ongoing',
    ThesisTitle: 'Hydroxyapatite Scaffolds for Bone Tissue Engineering', ProjectNo: 'CNS-2024-02', DivisionCode: '',
  },
];

export const mockEquipment: Equipment[] = [
  {
    UInsID: 'E001', Name: 'X-Ray Diffractometer (XRD)', EndUse: 'Phase Analysis',
    Division: 'ARC', IndenterName: 'Dr. A. K. Sharma', OperatorName: 'Rajesh Kumar',
    Location: 'Lab-A101', WorkingStatus: 'Working', Movable: 'No',
    RequirementInstallation: 'Completed', Justification: 'Phase identification of ceramics',
    Remark: 'Annual maintenance due April 2026',
  },
  {
    UInsID: 'E002', Name: 'Scanning Electron Microscope (SEM)', EndUse: 'Microstructure Analysis',
    Division: 'ARC', IndenterName: 'Dr. A. K. Sharma', OperatorName: 'Rajesh Kumar',
    Location: 'Lab-A102', WorkingStatus: 'Under Maintenance', Movable: 'No',
    RequirementInstallation: 'Completed', Justification: 'Microstructural characterization',
    Remark: 'Filament replacement in progress',
  },
  {
    UInsID: 'E003', Name: 'Thermogravimetric Analyzer (TGA)', EndUse: 'Thermal Analysis',
    Division: 'EEC', IndenterName: 'Dr. R. Mishra', OperatorName: 'Lab Staff',
    Location: 'Lab-B201', WorkingStatus: 'Working', Movable: 'Yes',
    RequirementInstallation: 'Completed', Justification: 'Thermal stability testing',
    Remark: '',
  },
  {
    UInsID: 'E004', Name: 'Atomic Force Microscope (AFM)', EndUse: 'Surface Imaging',
    Division: 'NST', IndenterName: 'Dr. S. Verma', OperatorName: 'Anil Gupta',
    Location: 'Lab-D301', WorkingStatus: 'Working', Movable: 'No',
    RequirementInstallation: 'Completed', Justification: 'Nanoscale surface characterization',
    Remark: '',
  },
  {
    UInsID: 'E005', Name: 'Electrochemical Workstation', EndUse: 'Sensor Testing',
    Division: 'BMS', IndenterName: 'Dr. P. Singh', OperatorName: 'Lab Staff',
    Location: 'Lab-C201', WorkingStatus: 'Working', Movable: 'Yes',
    RequirementInstallation: 'Completed', Justification: 'Biosensor characterization',
    Remark: '',
  },
  {
    UInsID: 'E006', Name: 'High-Temperature Furnace (1700°C)', EndUse: 'Sintering',
    Division: 'ARC', IndenterName: 'Dr. A. K. Sharma', OperatorName: 'Rajesh Kumar',
    Location: 'Lab-A103', WorkingStatus: 'Not Working', Movable: 'No',
    RequirementInstallation: 'Completed', Justification: 'Ceramic sintering operations',
    Remark: 'Heating element failure — repair order placed',
  },
];

export const mockScientificOutputs: ScientificOutput[] = [
  {
    id: 'SO001', title: 'Advanced castable refractories with nano-additions',
    authors: ['Dr. A. K. Sharma', 'Dr. Priya Mehta', 'Arjun Nair'],
    journal: 'Journal of the European Ceramic Society', year: 2024,
    doi: '10.1016/j.jeurceramsoc.2024.01.001', impactFactor: 5.8, citationCount: 12,
    divisionCode: 'ARC',
  },
  {
    id: 'SO002', title: 'Proton-conducting ceramics for intermediate-temperature SOFCs',
    authors: ['Dr. R. Mishra', 'Divya Kapoor'],
    journal: 'Journal of Power Sources', year: 2023,
    doi: '10.1016/j.jpowsour.2023.05.012', impactFactor: 9.2, citationCount: 28,
    divisionCode: 'EEC',
  },
  {
    id: 'SO003', title: 'Carbon nanotube reinforced SiC composites for aerospace',
    authors: ['Dr. S. Verma', 'Karan Bose'],
    journal: 'Composites Part B: Engineering', year: 2024,
    doi: '10.1016/j.compositesb.2024.03.005', impactFactor: 13.1, citationCount: 7,
    divisionCode: 'NST',
  },
  {
    id: 'SO004', title: 'Hydroxyapatite-chitosan scaffolds for bone regeneration',
    authors: ['Dr. P. Singh', 'Manish Tripathi'],
    journal: 'Biomaterials Science', year: 2023,
    doi: '10.1039/d3bm00234g', impactFactor: 7.5, citationCount: 19,
    divisionCode: 'BMS',
  },
];

export const mockIPIntelligence: IPIntelligence[] = [
  {
    id: 'IP001', title: 'Nano-Al2O3 Modified Castable Refractory Composition',
    type: 'Patent', status: 'Granted', filingDate: '2022-08-15',
    grantDate: '2024-03-20', inventors: ['Dr. A. K. Sharma', 'Dr. Priya Mehta'],
    divisionCode: 'ARC',
  },
  {
    id: 'IP002', title: 'Electrochemical Biosensor for Pb(II) Detection',
    type: 'Patent', status: 'Published', filingDate: '2023-11-01',
    inventors: ['Dr. P. Singh', 'Manish Tripathi'], divisionCode: 'BMS',
  },
];
