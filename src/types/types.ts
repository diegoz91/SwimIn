import { Models } from 'appwrite';

/**
 * Documento Appwrite con firma indice, come nelle versioni precedenti dell'SDK
 * (fino alla 13 `Models.Document` la includeva). Mantiene compatibile il codice
 * esistente che legge campi specifici di professionisti/strutture su un profilo
 * generico. TODO: sostituire con type guard (isProfessional/isStructure) e rimuovere.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppwriteDocument = Models.Document & { [key: string]: any };
export type UserType = 'professional' | 'structure';

export interface Certification {
  name: string;
  issuer: string;
  /** Chiave di CERT_CATEGORIES (i dati vecchi possono contenere l'etichetta). */
  category: string;
  /** Data di rilascio YYYY-MM-DD. */
  issueDate?: string;
  /** Data di scadenza YYYY-MM-DD; assente se non scade. */
  expiry?: string;
  /** Numero del brevetto o della tessera. */
  credentialId?: string;
  /** Id stabile assegnato dal server. */
  id?: string;
  /** Campi scritti solo dal server (verifica da parte di SwimIn). */
  documentFileId?: string;
  verificationStatus?: 'pending' | 'approved' | 'rejected';
  verified?: boolean;
  verifiedAt?: string;
  verificationNote?: string;
}

export interface Experience {
  role: string;
  facility: string;
  employmentType?: string;
  city?: string;
  /** Inizio YYYY-MM. */
  startDate?: string;
  /** Fine YYYY-MM; assente se in corso. */
  endDate?: string;
  current?: boolean;
  /** Formato vecchio, testo libero ("Set 2020 - Attuale"): solo lettura. */
  period?: string;
  description?: string;
}

export interface Media {
  type: 'image' | 'video';
  url: string;
  alt?: string;
}

// ----------------------------------------------------
// 1. PROFILES COLLECTION
// ----------------------------------------------------
export interface BaseProfile extends AppwriteDocument {
  userId: string;
  userType: UserType;
  /** Solo per l'utente corrente (dall'account): non è salvata sul profilo pubblico. */
  email: string;
  bio?: string;
  /** Immagine di copertina del profilo. */
  cover?: string;
  city?: string;
  province?: string;
  connections?: string[];
  typingTo?: string | null;
  readReceipts?: boolean;
  /** Scheda visibile anche senza account su /u/:id (le strutture lo sono sempre). */
  publicProfile?: boolean;
  /** Visita i profili in forma anonima ("Qualcuno ha visualizzato il tuo profilo"). */
  hideProfileViews?: boolean;
  /** Preferenze di notifica push/email per categoria (JSON, scritto dalla Function). */
  notificationPrefs?: string;
  /** SwimIn Premium (scritti solo dalla Function): attivo finché premiumUntil è nel futuro. */
  premiumUntil?: string | null;
  premiumSince?: string | null;
  premiumSource?: string | null;
  premiumTrialUsed?: boolean;
  inmailCredits?: number | null;
  inmailResetAt?: string | null;
  followersCount?: number;
  followingCount?: number;
  isOnline?: boolean;
  lastActive?: string;
  phone?: string;
  website?: string;
  /** Account sospeso da un amministratore. */
  suspended?: boolean;
  /** Ha brevetti in attesa di verifica. */
  pendingVerification?: boolean;
}

export interface UserProfile extends BaseProfile {
  userType: 'professional';
  firstName?: string;
  lastName?: string;
  title?: string;
  avatar?: string;
  experienceList?: string[];
  certificationsList?: string[];
  availableForEmergencies?: boolean;
  managedFacilities?: string[]; 
  /** Competenze dichiarate, confermabili dai collegamenti. */
  skills?: string[];
  languages?: string[];
  /** Fasce di disponibilità settimanale, es. "lun-mattina" (vedi utils/availability). */
  availability?: string[];
  /** Lavora nel nuoto oppure lo pratica per passione (allievi, master, community). */
  personType?: 'professional' | 'enthusiast';
  /** Attività praticate (soprattutto per gli appassionati). */
  sports?: string[];
}

export interface StructureProfile extends BaseProfile {
  userType: 'structure';
  structureName?: string;
  /** Membri dello staff (assunti o aggiunti): accedono all'area staff. Scritto dal server. */
  staff?: string[];
  structureType?: string;
  logo?: string;
  address?: string;
  postalCode?: string;
  vatNumber?: string;
  /** Lunghezza della vasca principale in metri. */
  poolLength?: number | null;
  lanes?: number | null;
  poolSetting?: 'coperta' | 'scoperta' | 'entrambe' | null;
  services?: string[];
  ratingSum?: number;
  ratingCount?: number;
}

export type AuthenticatedUser = Models.User<Models.Preferences> & (UserProfile | StructureProfile);

// ----------------------------------------------------
// 2. POSTS COLLECTION
// ----------------------------------------------------
export interface Post extends AppwriteDocument {
  authorId: string;
  authorType: UserType;
  content: string;
  postType: 'text' | 'image' | 'video' | 'link' | 'video-analysis' | 'repost';
  /** Ogni elemento è un oggetto Media serializzato in JSON: usa getPostContent() per leggerli. */
  media?: string[];
  category?: string;
  visibility: 'public' | 'connections_only';
  likesCount: number;
  commentsCount: number;
  /** ISO date dell'ultima modifica del testo da parte dell'autore. */
  editedAt?: string | null;
  /** Conteggi per reazione (JSON), scritti dalla Function: usa parseReactionCounts(). */
  reactionCounts?: string | null;
  /** Ripubblicazione: id del post originale. */
  repostOf?: string | null;
  repostsCount?: number;
  hashtags?: string[];
  mentions?: string[];
  /** Sondaggio: opzioni, scadenza (ISO) e totali per opzione (JSON). */
  pollOptions?: string[];
  pollEndsAt?: string | null;
  pollCounts?: string | null;
  /** Post pubblicato in un gruppo: non compare nel feed principale. */
  groupId?: string | null;
}

export interface EnrichedPost extends Post {
    recommendedBy?: { id: string; name: string };
    /** L'utente corrente ha reagito al post. */
    likedByMe?: boolean;
    /** La reazione dell'utente corrente (consiglio, applauso…), se c'è. */
    myReaction?: string | null;
    /** Voto dell'utente corrente al sondaggio (indice), se ha votato. */
    myVote?: number | null;
}

// ----------------------------------------------------
// 3. COMMENTS & LIKES
// ----------------------------------------------------
export interface Comment extends AppwriteDocument {
  postId: string;
  authorId: string;
  content: string;
  parentCommentId?: string | null;
  videoTimestamp?: number; 
  likesCount?: number;
}

export interface Like extends AppwriteDocument {
  postId: string;
  userId: string;
  /** Tipo di reazione; assente nei like creati prima delle reazioni (= consiglio). */
  reaction?: string | null;
}

export interface Follow extends AppwriteDocument {
  followerId: string;
  followeeId: string;
}

export type GroupCategory = 'master' | 'istruttori' | 'salvamento' | 'allenatori' | 'appassionati' | 'strutture' | 'territorio' | 'altro';
export type GroupPrivacy = 'open' | 'approval';

export interface Group extends AppwriteDocument {
  name: string;
  description: string;
  rules?: string;
  category: GroupCategory;
  privacy: GroupPrivacy;
  province?: string;
  cover?: string;
  creatorId: string;
  admins: string[];
  membersCount: number;
  postsCount: number;
}

export interface GroupMember extends AppwriteDocument {
  groupId: string;
  userId: string;
  role: 'admin' | 'member';
  status: 'active' | 'pending' | 'banned';
}

export interface PollVote extends AppwriteDocument {
  postId: string;
  userId: string;
  option: number;
}

export interface CommentLike extends AppwriteDocument {
  commentId: string;
  postId: string;
  userId: string;
}

// ----------------------------------------------------
// 4. JOBS & APPLICATIONS
// ----------------------------------------------------
export interface Job extends AppwriteDocument {
  structureId: string;
  title: string;
  description: string;
  role: string;
  contractType?: string;
  city: string;
  province?: string;
  salaryMin?: number;
  salaryMax?: number;
  workingHours?: string;
  isActive: boolean;
  structureName?: string; 
  facilityLogo?: string;
  candidates?: string[];
  requirements?: string[];
  qualificationsRequired?: string[];
  
  isSOS?: boolean;
  /** Annuncio di una struttura Premium: in evidenza nella bacheca. */
  featured?: boolean;
  sosDate?: string;
  sosShift?: string;
  /** YYYY-MM-DD: dopo questa data l'annuncio non viene più mostrato. */
  expiresAt?: string;
}

export interface Application extends AppwriteDocument {
  jobId: string;
  applicantId: string;
  status: 'pending' | 'reviewed' | 'accepted' | 'rejected' | 'hired';
  coverLetter?: string;
}

// ----------------------------------------------------
// 5. CONNECTIONS & MESSAGES
// ----------------------------------------------------
export interface Connection extends AppwriteDocument {
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface Message extends AppwriteDocument {
  conversationId: string;
  senderId: string;
  receiverId: string;
  /** Vuoto se il messaggio contiene solo allegati o è stato eliminato. */
  content: string;
  isRead: boolean;
  /** JSON di ChatAttachment: file nel bucket privato chat_files. */
  attachments?: string[];
  replyToId?: string | null;
  /** JSON {id, senderId, text} del messaggio citato. */
  replyPreview?: string | null;
  /** JSON {userId: reazione}. */
  reactions?: string | null;
  deleted?: boolean;
}

export interface ChatAttachment {
  fileId: string;
  name: string;
  mime: string;
  size: number;
}

// ----------------------------------------------------
// 6. SWIM-SQUAD
// ----------------------------------------------------
export interface SquadAnnouncement extends AppwriteDocument {
  structureId: string;
  content: string;
  isImportant: boolean;
  readBy: string[];
}

export interface SquadShift extends AppwriteDocument {
  structureId: string;
  userId: string;
  userName: string;
  date: string;
  shiftTime: string;
  role: string;
  /** Assegnato, confermato da chi lo copre, oppure rifiutato (non può coprirlo). */
  status: 'scheduled' | 'confirmed' | 'declined';
}

// ----------------------------------------------------
// 7. FACILITIES
// ----------------------------------------------------
export interface Facility extends AppwriteDocument {
  name: string;
  type?: string;
  city: string;
  province?: string;
  bio?: string;
  logo?: string;
  cover?: string;
  admins: string[];     
  staff: string[];      
  followers: string[];  
  ratingSum?: number;
  ratingCount?: number;
}

// ----------------------------------------------------
// 8. NOTIFICATIONS
// ----------------------------------------------------
export interface AppNotification extends AppwriteDocument {
  userId: string;
  type: 'connection' | 'hired' | 'rejected' | 'general' | 'like' | 'comment' | 'application' | 'endorsement' | 'sos' | 'shift' | 'repost' | 'profile_view' | 'mention' | 'follow' | 'group' | 'event';
  content: string;
  relatedId?: string;
  isRead: boolean;
}

export interface Endorsement extends AppwriteDocument {
  profileId: string;
  endorserId: string;
  skill: string;
}

// ----------------------------------------------------
// 9. LIVE ROOMS
// ----------------------------------------------------
export interface LiveRoom extends AppwriteDocument {
  title: string;
  description?: string;
  hostId: string;
  facilityId?: string;
  status: 'active' | 'ended';
  speakers: string[]; 
  listeners: string[];
  startedAt: string;
}

export interface Review extends AppwriteDocument {
  structureId: string;
  authorId: string;
  rating: number;
  content: string;
  /** Mese della visita YYYY-MM. */
  visitedAt?: string;
  reply?: string;
  replyAt?: string;
  editedAt?: string;
  status: 'published' | 'hidden';
}

export interface SavedItem extends AppwriteDocument {
  userId: string;
  targetType: 'post' | 'job';
  targetId: string;
}

export interface LiveMessage extends AppwriteDocument {
  roomId: string;
  authorId: string;
  content: string;
  kind: 'message' | 'question' | 'hand';
}

// ----------------------------------------------------
// 10. SWIM-MEETS
// ----------------------------------------------------
export interface SwimMeet extends AppwriteDocument {
  title: string;
  description: string;
  date: string;
  time: string;
  city: string;
  address?: string;
  creatorId: string;
  participants: string[];
  maxParticipants?: number | null;
  status: 'upcoming' | 'completed' | 'cancelled';
  type?: EventType | null;
  endTime?: string | null;
  isOnline?: boolean;
  onlineUrl?: string | null;
  province?: string | null;
  /** Quota in euro; 0 o assente = gratuito. */
  price?: number | null;
  /** Lista d'attesa quando i posti sono finiti (in ordine). */
  waitlist?: string[];
  cover?: string | null;
  groupId?: string | null;
}

export type EventType = 'allenamento' | 'gara' | 'corso' | 'open_day' | 'webinar' | 'incontro' | 'altro';