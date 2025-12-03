import { Injectable, Logger } from '@nestjs/common';
import { OrderItemDto } from '../order/dto/create-order.dto';
import { ProductUnavailableException } from './exceptions/product-unavailable.exception';
import { UnavailableProductDto } from './dto/product-availability-error.dto';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);
  
  // Mock inventory store: productId -> available quantity
  private readonly inventory: Map<string, number> = new Map();

  constructor() {
    // Seed with sample product data for testing
    this.initializeMockInventory();
  }

  /**
   * Initialize mock inventory with sample products
   */
  private initializeMockInventory(): void {
    // Sample products with stock quantities
    this.inventory.set('product-1', 100);
    this.inventory.set('product-2', 50);
    this.inventory.set('product-3', 200);
    this.inventory.set('product-4', 75);
    this.inventory.set('product-5', 0);
    
    this.logger.log('Mock inventory initialized with sample products');
  }

  /**
   * Check if a single product has sufficient availability
   */
  async checkAvailability(productId: string, quantity: number): Promise<boolean> {
    const availableStock = this.inventory.get(productId) ?? 0;
    const isAvailable = availableStock >= quantity;
    
    this.logger.debug(
      `Product ${productId}: requested ${quantity}, available ${availableStock}`,
    );
    
    return isAvailable;
  }

  /**
   * Check availability for all items in an order
   * Throws ProductUnavailableException if any product is unavailable
   */
  async checkOrderItemsAvailability(items: OrderItemDto[]): Promise<void> {
    const unavailableProducts: UnavailableProductDto[] = [];

    for (const item of items) {
      const isAvailable = await this.checkAvailability(item.productId, item.quantity);
      
      if (!isAvailable) {
        const availableStock = this.inventory.get(item.productId) ?? 0;
        unavailableProducts.push({
          productId: item.productId,
          requestedQuantity: item.quantity,
          availableQuantity: availableStock,
        });
      }
    }

    if (unavailableProducts.length > 0) {
      const errorMessage = `Product availability check failed for ${unavailableProducts.length} product(s)`;
      this.logger.warn(
        `${errorMessage}: ${unavailableProducts.map(p => `${p.productId} (requested: ${p.requestedQuantity}, available: ${p.availableQuantity})`).join(', ')}`,
      );
      throw new ProductUnavailableException(unavailableProducts);
    }

    this.logger.log(`All products in order are available`);
  }
}

