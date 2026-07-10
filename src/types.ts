export type UserRole = 'customer' | 'rider' | 'admin' | 'reviewer' | 'support';
export type RiderApprovalStatus = 'pending' | 'approved' | 'rejected';
export type OrderStatus = 'pending' | 'accepted' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled' | 'failed';
export type TopupStatus = 'pending' | 'approved' | 'rejected';
export type WalletTransactionType = 'topup' | 'deduction' | 'commission';
export type WalletCurrency = 'cash' | 'points';
export type PaymentMethod = 'ewallet' | 'eft' | 'cash';
export type DeliveryVehicle = 'bike' | 'car' | 'bakkie' | 'van' | 'truck';

export interface BaseUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  profileImageUrl?: string;
  pushToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Rider extends BaseUser {
  // National ID removed — Namibian driver's licence already contains the ID number
  licenseNumber: string;
  preferredVehicle: DeliveryVehicle;
  approvalStatus: RiderApprovalStatus;
  approvalNote?: string;
  approvedAt?: Date;
  isOnline: boolean;
  isAvailableForOrders: boolean;
  isVerified: boolean;
  rating: number;
  ratingCount: number;
  totalDeliveries: number;
  totalEarnings: number;
  /** Cash wallet (N$) — commission is charged here on ride completion; may go negative. */
  cashBalance: number;
  /** Ride points — free/promo rides; each covers one ride's commission. */
  ridePoints: number;
  /** @deprecated Legacy credits; superseded by ridePoints + cashBalance. */
  walletBalance: number;
  totalCreditsPurchased: number;
  licenseFrontUrl?: string;   // Driver's licence front (contains ID number)
  licenseBackUrl?: string;    // Driver's licence back (vehicle categories)
  vehicleRegDocUrl?: string;
  roadworthyDocUrl?: string;
  licenseDiscDocUrl?: string;
}

export interface Order {
  id: string;
  trackingCode: string;
  customerId: string;
  riderId?: string;
  status: OrderStatus;
  vehicleType: DeliveryVehicle;
  price: { baseFare: number; distanceFare: number; weightSurcharge: number; total: number };
  distanceKm: number;
  estimatedMinutes: number;
  pickupAddress: { formattedAddress: string };
  deliveryAddress: { formattedAddress: string };
  timeline: { createdAt: Date; acceptedAt?: Date; deliveredAt?: Date; cancelledAt?: Date };
  cancellationReason?: string;
  customerRating?: number;
}

export interface WalletTransaction {
  id: string;
  riderId: string;
  type: WalletTransactionType;
  credits: number;
  currency?: WalletCurrency;
  priceNAD?: number;
  packageName?: string;
  paymentMethod?: PaymentMethod;
  paymentRef?: string;
  proofUrl?: string;
  status: TopupStatus;
  orderId?: string;
  note?: string;
  createdAt: Date;
  processedAt?: Date;
  processedBy?: string;
}

export interface CreditPackage {
  id: string;
  name: string;
  creditsAmount: number;
  priceNAD: number;
  isActive: boolean;
  description: string;
  sortOrder: number;
}

export interface AppConfig {
  maintenanceMode: boolean;
  /** Fraction of the fare taken as platform commission (0.15 = 15%). */
  commissionRate?: number;
  /** Lowest cash balance (N$) a rider may go online at; may be negative. */
  creditLimit?: number;
  adminEmail?: string; // receives pending-approval and wallet-request email alerts
  // Standardised field names — must match what the Dash app reads (appConfig/settings)
  paymentEwalletNumber?: string;
  paymentEwalletName?: string;
  paymentBankName?: string;
  paymentAccountNumber?: string;
  paymentBranchCode?: string;
}
