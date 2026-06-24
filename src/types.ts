export type UserRole = 'customer' | 'rider' | 'admin';
export type RiderApprovalStatus = 'pending' | 'approved' | 'rejected';
export type OrderStatus = 'pending' | 'accepted' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled' | 'failed';
export type TopupStatus = 'pending' | 'approved' | 'rejected';
export type WalletTransactionType = 'topup' | 'deduction';
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
  nationalId: string;
  licenseNumber: string;
  preferredVehicle: DeliveryVehicle;
  approvalStatus: RiderApprovalStatus;
  approvalNote?: string;
  isOnline: boolean;
  isAvailableForOrders: boolean;
  isVerified: boolean;
  rating: number;
  ratingCount: number;
  totalDeliveries: number;
  totalEarnings: number;
  walletBalance: number;
  totalCreditsPurchased: number;
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
  paymentEwallet?: string;
  paymentEwalletName?: string;
  paymentBankName?: string;
  paymentAccountNumber?: string;
  paymentBranchCode?: string;
}
