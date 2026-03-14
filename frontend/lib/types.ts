export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  auth_provider: string;
  is_active: boolean;
  google_connected: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface SourceBreakdown {
  source: string;
  count: number;
}

export interface IngestionTrend {
  date: string;
  count: number;
}

export interface AnalyticsOverview {
  total_candidates: number;
  total_shortlists: number;
  sources: SourceBreakdown[];
  ingestion_trends: IngestionTrend[];
}

export interface CandidateListItem {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  current_title: string | null;
  years_experience: number | null;
  source: string;
  ingestion_status: string;
  confidence_score: number | null;
  created_at: string;
}

export interface CandidateDetail extends CandidateListItem {
  linkedin_url: string | null;
  skills: string[] | null;
  education: { degree?: string; institution?: string; year?: string; field_of_study?: string }[] | null;
  experience: { title?: string; company?: string; duration?: string; description?: string }[] | null;
  summary: string | null;
  raw_text: string | null;
  source_ref: string | null;
  ingestion_error: string | null;
  updated_at: string;
}

export interface CandidateListResponse {
  total: number;
  skip: number;
  limit: number;
  results: CandidateListItem[];
}

export interface SearchResultItem {
  candidate_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  current_title: string | null;
  years_experience: number | null;
  skills: string[] | null;
  summary: string | null;
  source: string | null;
  confidence_score: number | null;
  similarity_score: number;
}

export interface SearchResponse {
  query: string;
  intent: Record<string, unknown>;
  total: number;
  results: SearchResultItem[];
}

export interface BatchFileResult {
  filename: string;
  status: "success" | "error";
  candidate_id?: string;
  error?: string;
}

export interface BatchUploadResponse {
  total: number;
  succeeded: number;
  failed: number;
  results: BatchFileResult[];
}

export interface SyncResponse {
  source: string;
  total: number;
  results: { name?: string; filename?: string; candidate_id?: string; status: string }[];
}

// Dedup
export interface CandidateSummary {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  location: string | null;
  current_title: string | null;
  years_experience: number | null;
  skills: string[] | null;
  source: string;
  created_at: string;
}

export interface DedupQueueItem {
  id: string;
  candidate_a: CandidateSummary;
  candidate_b: CandidateSummary;
  composite_score: number;
  score_breakdown: Record<string, number> | null;
  status: string;
  created_at: string;
}

export interface DedupQueueListItem {
  id: string;
  candidate_a_id: string;
  candidate_a_name: string;
  candidate_b_id: string;
  candidate_b_name: string;
  composite_score: number;
  status: string;
  created_at: string;
}

export interface DedupActionResponse {
  status: string;
  message: string;
  candidate_id: string | null;
}

// Shortlists
export interface ShortlistResponse {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  candidate_count: number;
  created_at: string;
  updated_at: string;
}

export interface ShortlistCandidateItem {
  id: string;
  candidate_id: string;
  full_name: string;
  email: string | null;
  current_title: string | null;
  notes: string | null;
  added_at: string;
}

export interface ShortlistDetailResponse extends ShortlistResponse {
  candidates: ShortlistCandidateItem[];
}

// Activity
export interface ActivityLogItem {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ActivityLogResponse {
  total: number;
  results: ActivityLogItem[];
}

// Jobs
export interface JobResponse {
  id: string;
  title: string;
  company: string | null;
  department: string | null;
  location: string | null;
  employment_type: string | null;
  experience_required: number | null;
  salary_min: number | null;
  salary_max: number | null;
  skills_required: string[] | null;
  job_description: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchScoreBreakdown {
  semantic_similarity: number;
  skill_match: number;
  experience_match: number;
  title_relevance: number;
}

export interface MatchResultItem {
  candidate_id: string;
  full_name: string;
  email: string | null;
  location: string | null;
  current_title: string | null;
  years_experience: number | null;
  skills: string[] | null;
  composite_score: number;
  breakdown: MatchScoreBreakdown;
}

export interface MatchResponse {
  job_id: string;
  job_title: string;
  total: number;
  results: MatchResultItem[];
}

export interface CompareCandidate {
  candidate_id: string;
  full_name: string;
  email: string | null;
  location: string | null;
  current_title: string | null;
  years_experience: number | null;
  skills: string[] | null;
  education: Record<string, string>[] | null;
  experience: Record<string, string>[] | null;
  semantic_match: number;
  skill_overlap: number;
  experience_score: number;
  overall_score: number;
}

export interface CompareResponse {
  job_id: string;
  job_title: string;
  candidates: CompareCandidate[];
}

// Employees
export interface EmployeeResponse {
  id: string;
  name: string;
  email: string;
  department: string | null;
  company: string | null;
  created_at: string;
}

// Referrals
export interface ReferralResponse {
  id: string;
  employee_id: string;
  candidate_id: string;
  job_id: string;
  status: string;
  notes: string | null;
  referred_at: string;
  employee_name: string | null;
  candidate_name: string | null;
  job_title: string | null;
}

export interface ReferralListResponse {
  total: number;
  results: ReferralResponse[];
}

export interface ReferralAnalytics {
  total_referrals: number;
  total_hires: number;
  success_rate: number;
  top_referrers: { name: string; department: string | null; referral_count: number; hires: number }[];
  department_breakdown: { department: string; count: number }[];
  status_breakdown: { status: string; count: number }[];
}

export interface WsMessage {
  type:
    | "INGESTION_COMPLETE"
    | "DEDUP_UPDATE"
    | "GMAIL_SYNC_PROGRESS"
    | "HRMS_SYNC_PROGRESS"
    | "LINKEDIN_PARSED"
    | "JOB_CREATED"
    | "JOB_MATCH_COMPLETED"
    | "REFERRAL_CREATED"
    | "REFERRAL_STATUS_UPDATED";
  candidate_id?: string;
  candidate_name?: string;
  status?: string;
  source?: string;
  action?: string;
  match_id?: string;
  new_name?: string;
  existing_name?: string;
  score?: number;
  synced?: number;
  total?: number;
  filename?: string;
}
