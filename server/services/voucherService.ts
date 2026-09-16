// =====================================================
// VOUCHER SERVICE
// Phase 2B-6 Stage 2 for Booking Bridge OS
// Generates Voucher records for fully-confirmed bookings.
// Authorized: Operations, Admin, Founder
// Precondition: booking.status === 'IN_OPERATIONS'
//               AND confirmationProgress.allConfirmed === true
// =====================================================

import { UserRole, AuditLog, Voucher, VoucherType } from '../../src/types';
import {
  Booking,
  BookingAccommodation,
  BookingTransport,
  BookingActivity,
} from '../../src/types/booking';
import { getAdminDb } from '../firebaseAdmin.js';

// ── Actor & DTOs ──────────────────────────────────────────────────────────────

export interface VoucherActor {
  id: string;
  uid?: string;
  name: string;
  email?: string;
  role: UserRole;
  isDemo?: boolean;
}

export interface GenerateVouchersResult {
  success: boolean;
  vouchers: Voucher[];
  message: string;
}

// ── Error ──────────────────────────────────────────────────────────────────────

export class VoucherError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'VoucherError';
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateVoucherId(): string {
  return `VCHR-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function generateAuditId(): string {
  return `AUDIT-VC-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ── Storage abstraction ────────────────────────────────────────────────────────

export interface VoucherStorageProvider {
  getBooking(bookingId: string): Promise<Booking | null>;
  getServicesByBooking(bookingId: string): Promise<{
    accommodations: BookingAccommodation[];
    transports: BookingTransport[];
    activities: BookingActivity[];
  }>;
  getVouchersForBooking(bookingId: string): Promise<Voucher[]>;
  saveVoucher(voucher: Voucher): Promise<void>;
  updateAccommodation(id: string, data: Partial<BookingAccommodation>): Promise<void>;
  updateTransport(id: string, data: Partial<BookingTransport>): Promise<void>;
  updateActivity(id: string, data: Partial<BookingActivity>): Promise<void>;
  logAuditEvent(auditLog: AuditLog): Promise<void>;
}

// In-memory implementation for testing
export class InMemoryVoucherStorageProvider implements VoucherStorageProvider {
  private bookings: Map<string, Booking> = new Map();
  private accommodations: Map<string, BookingAccommodation> = new Map();
  private transports: Map<string, BookingTransport> = new Map();
  private activities: Map<string, BookingActivity> = new Map();
  private vouchers: Map<string, Voucher> = new Map();
  private auditLogs: Map<string, AuditLog> = new Map();

  constructor(initialData?: {
    bookings?: Booking[];
    accommodations?: BookingAccommodation[];
    transports?: BookingTransport[];
    activities?: BookingActivity[];
    vouchers?: Voucher[];
  }) {
    for (const b of initialData?.bookings || []) this.bookings.set(b.id, JSON.parse(JSON.stringify(b)));
    for (const s of initialData?.accommodations || []) this.accommodations.set(s.id, JSON.parse(JSON.stringify(s)));
    for (const s of initialData?.transports || []) this.transports.set(s.id, JSON.parse(JSON.stringify(s)));
    for (const s of initialData?.activities || []) this.activities.set(s.id, JSON.parse(JSON.stringify(s)));
    for (const v of initialData?.vouchers || []) this.vouchers.set(v.id, JSON.parse(JSON.stringify(v)));
  }

  async getBooking(id: string): Promise<Booking | null> {
    const b = this.bookings.get(id);
    return b ? JSON.parse(JSON.stringify(b)) : null;
  }

  async getServicesByBooking(bookingId: string) {
    return {
      accommodations: Array.from(this.accommodations.values()).filter(s => s.bookingId === bookingId).map(s => JSON.parse(JSON.stringify(s))),
      transports: Array.from(this.transports.values()).filter(s => s.bookingId === bookingId).map(s => JSON.parse(JSON.stringify(s))),
      activities: Array.from(this.activities.values()).filter(s => s.bookingId === bookingId).map(s => JSON.parse(JSON.stringify(s))),
    };
  }

  async getVouchersForBooking(bookingId: string): Promise<Voucher[]> {
    return Array.from(this.vouchers.values()).filter(v => v.bookingId === bookingId).map(v => JSON.parse(JSON.stringify(v)));
  }

  async saveVoucher(voucher: Voucher): Promise<void> {
    this.vouchers.set(voucher.id, JSON.parse(JSON.stringify(voucher)));
  }

  async updateAccommodation(id: string, data: Partial<BookingAccommodation>): Promise<void> {
    const existing = this.accommodations.get(id);
    if (existing) this.accommodations.set(id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
  }

  async updateTransport(id: string, data: Partial<BookingTransport>): Promise<void> {
    const existing = this.transports.get(id);
    if (existing) this.transports.set(id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
  }

  async updateActivity(id: string, data: Partial<BookingActivity>): Promise<void> {
    const existing = this.activities.get(id);
    if (existing) this.activities.set(id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
  }

  async logAuditEvent(auditLog: AuditLog): Promise<void> {
    this.auditLogs.set(auditLog.id, JSON.parse(JSON.stringify(auditLog)));
  }

  // Test helpers
  getAllVouchers(): Voucher[] { return Array.from(this.vouchers.values()); }
  getAccommodationSync(id: string): BookingAccommodation | undefined { return this.accommodations.get(id); }
  getTransportSync(id: string): BookingTransport | undefined { return this.transports.get(id); }
  getActivitySync(id: string): BookingActivity | undefined { return this.activities.get(id); }
}

// Firestore production implementation
export class FirestoreVoucherStorageProvider implements VoucherStorageProvider {
  private db() { return getAdminDb(); }

  async getBooking(id: string): Promise<Booking | null> {
    const snap = await this.db().collection('bookings').doc(id).get();
    return snap.exists ? (snap.data() as Booking) : null;
  }

  async getServicesByBooking(bookingId: string) {
    const [accSnap, transSnap, actSnap] = await Promise.all([
      this.db().collection('booking_accommodations').where('bookingId', '==', bookingId).get(),
      this.db().collection('booking_transports').where('bookingId', '==', bookingId).get(),
      this.db().collection('booking_activities').where('bookingId', '==', bookingId).get(),
    ]);
    return {
      accommodations: accSnap.docs.map(d => d.data() as BookingAccommodation),
      transports: transSnap.docs.map(d => d.data() as BookingTransport),
      activities: actSnap.docs.map(d => d.data() as BookingActivity),
    };
  }

  async getVouchersForBooking(bookingId: string): Promise<Voucher[]> {
    const snap = await this.db().collection('vouchers').where('bookingId', '==', bookingId).get();
    return snap.docs.map(d => d.data() as Voucher);
  }

  async saveVoucher(voucher: Voucher): Promise<void> {
    await this.db().collection('vouchers').doc(voucher.id).set(voucher);
  }

  async updateAccommodation(id: string, data: Partial<BookingAccommodation>): Promise<void> {
    await this.db().collection('booking_accommodations').doc(id).update(data as any);
  }

  async updateTransport(id: string, data: Partial<BookingTransport>): Promise<void> {
    await this.db().collection('booking_transports').doc(id).update(data as any);
  }

  async updateActivity(id: string, data: Partial<BookingActivity>): Promise<void> {
    await this.db().collection('booking_activities').doc(id).update(data as any);
  }

  async logAuditEvent(auditLog: AuditLog): Promise<void> {
    await this.db().collection('audit_logs').doc(auditLog.id).set(auditLog);
  }
}

// ── RBAC ──────────────────────────────────────────────────────────────────────

const VOUCHER_ROLES: UserRole[] = ['Founder', 'Admin', 'Operations'];

// ── Service ────────────────────────────────────────────────────────────────────

export class VoucherService {
  private storageProvider: VoucherStorageProvider;

  constructor(storageProvider?: VoucherStorageProvider) {
    this.storageProvider = storageProvider || new FirestoreVoucherStorageProvider();
  }

  /**
   * Generate one Voucher document per service for a fully-confirmed booking.
   *
   * Authorized: Operations, Admin, Founder
   * Preconditions:
   *   - booking.status === 'IN_OPERATIONS'
   *   - booking.confirmationProgress.allConfirmed === true
   */
  async generateVouchers(bookingId: string, actor: VoucherActor): Promise<GenerateVouchersResult> {
    if (!VOUCHER_ROLES.includes(actor.role)) {
      throw new VoucherError(403, 'FORBIDDEN', `Role "${actor.role}" is not authorized to generate vouchers.`);
    }

    const booking = await this.storageProvider.getBooking(bookingId);
    if (!booking) {
      throw new VoucherError(404, 'BOOKING_NOT_FOUND', `Booking "${bookingId}" not found.`);
    }

    if (booking.status !== 'IN_OPERATIONS') {
      throw new VoucherError(
        422,
        'INVALID_BOOKING_STATUS',
        `Vouchers can only be generated for IN_OPERATIONS bookings. Current status: "${booking.status}".`
      );
    }

    if (!booking.confirmationProgress?.allConfirmed) {
      throw new VoucherError(
        422,
        'SERVICES_NOT_FULLY_CONFIRMED',
        'All services must be CONFIRMED before vouchers can be generated.'
      );
    }

    const { accommodations, transports, activities } = await this.storageProvider.getServicesByBooking(bookingId);

    // Idempotency: return existing vouchers if already generated
    const existingVouchers = await this.storageProvider.getVouchersForBooking(bookingId);
    if (existingVouchers.length > 0) {
      return {
        success: true,
        vouchers: existingVouchers,
        message: `Vouchers have already been generated for booking "${bookingId}".`,
      };
    }

    const now = new Date().toISOString();
    const generatedVouchers: Voucher[] = [];

    // Generate one voucher per accommodation service
    for (const acc of accommodations) {
      const voucher: Voucher = {
        id: generateVoucherId(),
        bookingId,
        tripId: acc.tripId,
        type: 'HOTEL' as VoucherType,
        status: 'GENERATED',
        generatedAt: now,
        isDemo: booking.isDemo,
      };
      await this.storageProvider.saveVoucher(voucher);
      await this.storageProvider.updateAccommodation(acc.id, { voucherId: voucher.id, voucherStatus: 'GENERATED', updatedAt: now });
      generatedVouchers.push(voucher);
    }

    // Generate one voucher per transport service
    for (const trans of transports) {
      const voucher: Voucher = {
        id: generateVoucherId(),
        bookingId,
        tripId: trans.tripId,
        type: 'TRANSPORT' as VoucherType,
        status: 'GENERATED',
        generatedAt: now,
        isDemo: booking.isDemo,
      };
      await this.storageProvider.saveVoucher(voucher);
      await this.storageProvider.updateTransport(trans.id, { voucherId: voucher.id, voucherStatus: 'GENERATED', updatedAt: now });
      generatedVouchers.push(voucher);
    }

    // Generate one voucher per activity service
    for (const act of activities) {
      const voucher: Voucher = {
        id: generateVoucherId(),
        bookingId,
        tripId: act.tripId,
        type: 'ACTIVITY' as VoucherType,
        status: 'GENERATED',
        generatedAt: now,
        isDemo: booking.isDemo,
      };
      await this.storageProvider.saveVoucher(voucher);
      await this.storageProvider.updateActivity(act.id, { voucherId: voucher.id, voucherStatus: 'GENERATED', updatedAt: now });
      generatedVouchers.push(voucher);
    }

    // Audit log
    const auditLog: AuditLog = {
      id: generateAuditId(),
      timestamp: now,
      actorType: 'HUMAN',
      actorId: actor.uid || actor.id,
      actorName: `${actor.name} (${actor.role})`,
      action: 'VOUCHERS_GENERATED',
      entityType: 'BOOKING',
      entityId: bookingId,
      before: {},
      after: { voucherCount: generatedVouchers.length, voucherIds: generatedVouchers.map(v => v.id) },
      reason: `${generatedVouchers.length} voucher(s) generated by ${actor.name} (${actor.role})`,
    };
    await this.storageProvider.logAuditEvent(auditLog);

    return {
      success: true,
      vouchers: generatedVouchers,
      message: `Successfully generated ${generatedVouchers.length} voucher(s) for booking "${bookingId}".`,
    };
  }
}
