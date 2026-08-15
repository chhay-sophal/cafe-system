import { randomUUID } from 'crypto';
import { db } from './index.js';
import {
  users,
  categories,
  products,
  modifierGroups,
  modifiers,
  productModifiers,
  inventoryItems,
  recipes,
} from './schema.js';

async function seed() {
  console.log('🌱 Starting database seeding...');

  // ============================================================================
  // 1. STAFF USERS
  // ============================================================================
  console.log('Seeding Users...');
  const cashierId = randomUUID();
  const managerId = randomUUID();
  const adminId = randomUUID();

  await db.insert(users).values([
    {
      id: cashierId,
      name: 'Alice Cashier',
      pinHash: '1234', // Simple 4-digit PIN
      role: 'CASHIER',
      isActive: true,
    },
    {
      id: managerId,
      name: 'Bob Manager',
      pinHash: '9999',
      role: 'MANAGER',
      isActive: true,
    },
    {
      id: adminId,
      name: 'Charlie Admin',
      pinHash: '0000',
      role: 'ADMIN',
      isActive: true,
    },
  ]);

  // ============================================================================
  // 2. INVENTORY ITEMS (RAW STOCK)
  // ============================================================================
  console.log('Seeding Raw Inventory Items...');
  const invEspressoBeans = randomUUID();
  const invWholeMilk = randomUUID();
  const invOatMilk = randomUUID();
  const invVanillaSyrup = randomUUID();
  const invHotCup12oz = randomUUID();
  const invColdCup16oz = randomUUID();

  await db.insert(inventoryItems).values([
    {
      id: invEspressoBeans,
      name: 'House Blend Espresso Beans',
      stockQuantity: 10000, // 10,000 grams (10kg)
      unit: 'grams',
      reorderThreshold: 2000,
      costPerUnit: 0.02, // $0.02 per gram
    },
    {
      id: invWholeMilk,
      name: 'Whole Milk',
      stockQuantity: 20000, // 20,000 ml (20 Liters)
      unit: 'ml',
      reorderThreshold: 5000,
      costPerUnit: 0.0015,
    },
    {
      id: invOatMilk,
      name: 'Oatly Oat Milk',
      stockQuantity: 12000, // 12,000 ml (12 Liters)
      unit: 'ml',
      reorderThreshold: 3000,
      costPerUnit: 0.003,
    },
    {
      id: invVanillaSyrup,
      name: 'Monin Vanilla Syrup',
      stockQuantity: 2000, // 2,000 ml
      unit: 'ml',
      reorderThreshold: 500,
      costPerUnit: 0.01,
    },
    {
      id: invHotCup12oz,
      name: '12oz Paper Hot Cup & Lid',
      stockQuantity: 500, // 500 units
      unit: 'pieces',
      reorderThreshold: 100,
      costPerUnit: 0.12,
    },
    {
      id: invColdCup16oz,
      name: '16oz Clear PET Cold Cup & Lid',
      stockQuantity: 500, // 500 units
      unit: 'pieces',
      reorderThreshold: 100,
      costPerUnit: 0.15,
    },
  ]);

  // ============================================================================
  // 3. CATEGORIES
  // ============================================================================
  console.log('Seeding Categories...');
  const catEspresso = randomUUID();
  const catIced = randomUUID();
  const catBakery = randomUUID();

  await db.insert(categories).values([
    { id: catEspresso, name: 'Hot Espresso', sortOrder: 1 },
    { id: catIced, name: 'Iced Drinks', sortOrder: 2 },
    { id: catBakery, name: 'Bakery & Pastries', sortOrder: 3 },
  ]);

  // ============================================================================
  // 4. PRODUCTS
  // ============================================================================
  console.log('Seeding Products...');
  const prodEspresso = randomUUID();
  const prodAmericano = randomUUID();
  const prodLatte = randomUUID();
  const prodIcedLatte = randomUUID();

  await db.insert(products).values([
    {
      id: prodEspresso,
      categoryId: catEspresso,
      name: 'Double Espresso',
      basePrice: 3.0,
      sku: 'ESP-DBL',
      imageUrl: '/uploads/products/espresso.jpg',
      isAvailable: true,
    },
    {
      id: prodAmericano,
      categoryId: catEspresso,
      name: 'Hot Americano (12oz)',
      basePrice: 3.5,
      sku: 'AME-HOT-12',
      imageUrl: '/uploads/products/americano.jpg',
      isAvailable: true,
    },
    {
      id: prodLatte,
      categoryId: catEspresso,
      name: 'Caffe Latte (12oz)',
      basePrice: 4.5,
      sku: 'LAT-HOT-12',
      imageUrl: '/uploads/products/latte.jpg',
      isAvailable: true,
    },
    {
      id: prodIcedLatte,
      categoryId: catIced,
      name: 'Iced Latte (16oz)',
      basePrice: 5.0,
      sku: 'LAT-ICE-16',
      imageUrl: '/uploads/products/iced-latte.jpg',
      isAvailable: true,
    },
  ]);

  // ============================================================================
  // 5. MODIFIER GROUPS & MODIFIERS
  // ============================================================================
  console.log('Seeding Modifiers...');
  const groupMilk = randomUUID();
  const groupSyrup = randomUUID();

  await db.insert(modifierGroups).values([
    {
      id: groupMilk,
      name: 'Milk Choice',
      minSelection: 0,
      maxSelection: 1,
    },
    {
      id: groupSyrup,
      name: 'Syrup Flavor',
      minSelection: 0,
      maxSelection: 3,
    },
  ]);

  const modOatMilk = randomUUID();
  const modVanillaSyrup = randomUUID();

  await db.insert(modifiers).values([
    {
      id: modOatMilk,
      groupId: groupMilk,
      name: 'Oat Milk Substitution',
      priceExtra: 0.8,
    },
    {
      id: modVanillaSyrup,
      groupId: groupSyrup,
      name: 'Vanilla Syrup (1 Shot)',
      priceExtra: 0.5,
    },
  ]);

  // Link Modifier Groups to Latte Products
  await db.insert(productModifiers).values([
    { productId: prodLatte, groupId: groupMilk },
    { productId: prodLatte, groupId: groupSyrup },
    { productId: prodIcedLatte, groupId: groupMilk },
    { productId: prodIcedLatte, groupId: groupSyrup },
  ]);

  // ============================================================================
  // 6. RECIPES (AUTOMATIC INVENTORY DEDUCTION MAPPING)
  // ============================================================================
  console.log('Seeding Recipe Rules...');

  await db.insert(recipes).values([
    // Double Espresso: 18g Beans
    {
      id: randomUUID(),
      productId: prodEspresso,
      modifierId: null,
      inventoryItemId: invEspressoBeans,
      quantityRequired: 18,
    },
    // Hot Americano: 18g Beans + 1 Hot Cup
    {
      id: randomUUID(),
      productId: prodAmericano,
      modifierId: null,
      inventoryItemId: invEspressoBeans,
      quantityRequired: 18,
    },
    {
      id: randomUUID(),
      productId: prodAmericano,
      modifierId: null,
      inventoryItemId: invHotCup12oz,
      quantityRequired: 1,
    },
    // Hot Latte: 18g Beans + 220ml Whole Milk + 1 Hot Cup
    {
      id: randomUUID(),
      productId: prodLatte,
      modifierId: null,
      inventoryItemId: invEspressoBeans,
      quantityRequired: 18,
    },
    {
      id: randomUUID(),
      productId: prodLatte,
      modifierId: null,
      inventoryItemId: invWholeMilk,
      quantityRequired: 220,
    },
    {
      id: randomUUID(),
      productId: prodLatte,
      modifierId: null,
      inventoryItemId: invHotCup12oz,
      quantityRequired: 1,
    },
    // Iced Latte: 18g Beans + 200ml Whole Milk + 1 Cold Cup
    {
      id: randomUUID(),
      productId: prodIcedLatte,
      modifierId: null,
      inventoryItemId: invEspressoBeans,
      quantityRequired: 18,
    },
    {
      id: randomUUID(),
      productId: prodIcedLatte,
      modifierId: null,
      inventoryItemId: invWholeMilk,
      quantityRequired: 200,
    },
    {
      id: randomUUID(),
      productId: prodIcedLatte,
      modifierId: null,
      inventoryItemId: invColdCup16oz,
      quantityRequired: 1,
    },
    // MODIFIER RECIPES (Deducts Oat Milk or Syrup)
    {
      id: randomUUID(),
      productId: null,
      modifierId: modOatMilk,
      inventoryItemId: invOatMilk,
      quantityRequired: 200,
    },
    {
      id: randomUUID(),
      productId: null,
      modifierId: modVanillaSyrup,
      inventoryItemId: invVanillaSyrup,
      quantityRequired: 15,
    },
  ]);

  console.log('✅ Database successfully seeded!');
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});