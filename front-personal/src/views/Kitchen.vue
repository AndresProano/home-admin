<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useHousehold } from '@/composables/useHousehold'
import { useKitchen } from '@/composables/useKitchen'

const router = useRouter()
const { user } = useAuth()
const { currentHousehold } = useHousehold()
const { items, loadItems, addItem, updateQuantity, removeItem, lowStockItems } = useKitchen()

const showForm = ref(false)
const newName = ref('')
const newQuantity = ref(1)
const newThreshold = ref(1)
const newCategory = ref('Fruits')
const filterCategory = ref('All')

const categories = ['Fruits', 'Vegetables', 'Dairy', 'Meat', 'Grains', 'Beverages', 'Snacks', 'Frozen', 'Cleaning', 'Other']

const filteredItems = computed(() => {
  if (filterCategory.value === 'All') return items.value
  return items.value.filter(i => i.category === filterCategory.value)
})

const activeCategories = computed(() => {
  const cats = new Set(items.value.map(i => i.category))
  return ['All', ...categories.filter(c => cats.has(c))]
})

onMounted(async () => {
  if (currentHousehold.value) {
    await loadItems(currentHousehold.value.id)
  }
})

const handleAdd = async () => {
  if (!newName.value.trim() || !currentHousehold.value || !user.value) return
  await addItem(
    currentHousehold.value.id,
    { name: newName.value.trim(), quantity: newQuantity.value, threshold: newThreshold.value, category: newCategory.value },
    user.value.id
  )
  newName.value = ''
  newQuantity.value = 1
  newThreshold.value = 1
  newCategory.value = 'Fruits'
  showForm.value = false
}

const handleRemove = async (id: string, name: string) => {
  if (confirm(`Remove "${name}" from kitchen?`)) {
    await removeItem(id)
  }
}
</script>

<template>
  <div class="kitchen-page">
    <header class="page-header">
      <button class="back-btn" @click="router.push('/home')">&larr;</button>
      <h1>Kitchen Storage</h1>
    </header>

    <!-- Low stock alert -->
    <div v-if="lowStockItems().length" class="alert">
      <strong>Low stock:</strong> {{ lowStockItems().map(i => i.name).join(', ') }}
    </div>

    <!-- Category filter -->
    <div class="filter-bar">
      <button
        v-for="cat in activeCategories"
        :key="cat"
        :class="['filter-chip', { active: filterCategory === cat }]"
        @click="filterCategory = cat"
      >
        {{ cat }}
      </button>
    </div>

    <!-- Items grid -->
    <div class="items-grid">
      <div
        v-for="item in filteredItems"
        :key="item.id"
        :class="['item-card', { 'low-stock': item.quantity <= item.threshold }]"
      >
        <div class="item-header">
          <span class="item-category">{{ item.category }}</span>
          <button class="remove-btn" @click="handleRemove(item.id, item.name)">&times;</button>
        </div>
        <h3>{{ item.name }}</h3>
        <div class="quantity-controls">
          <button @click="updateQuantity(item.id, item.quantity - 1)">-</button>
          <span class="quantity">{{ item.quantity }}</span>
          <button @click="updateQuantity(item.id, item.quantity + 1)">+</button>
        </div>
        <small v-if="item.quantity <= item.threshold" class="low-label">Low stock!</small>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!items.length" class="empty-state">
      <p>No items yet. Add your first kitchen item!</p>
    </div>

    <!-- Add button -->
    <button class="fab" @click="showForm = true" v-if="!showForm">+</button>

    <!-- Add form modal -->
    <div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
      <form class="modal-form" @submit.prevent="handleAdd">
        <h2>Add Item</h2>
        <label>
          Name
          <input v-model="newName" type="text" placeholder="e.g. Apples" required />
        </label>
        <label>
          Category
          <select v-model="newCategory">
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </label>
        <div class="form-row">
          <label>
            Quantity
            <input v-model.number="newQuantity" type="number" min="0" />
          </label>
          <label>
            Low stock alert at
            <input v-model.number="newThreshold" type="number" min="0" />
          </label>
        </div>
        <div class="form-actions">
          <button type="button" @click="showForm = false">Cancel</button>
          <button type="submit" class="primary">Add</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.kitchen-page { padding: 16px; padding-bottom: 80px; }

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.page-header h1 { margin: 0; font-size: 1.4rem; }
.back-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 4px 8px;
}

.alert {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 12px;
  font-size: 0.9rem;
}

.filter-bar {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: 16px;
}
.filter-chip {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
  white-space: nowrap;
  font-size: 0.85rem;
}
.filter-chip.active {
  background: #4caf50;
  color: white;
  border-color: #4caf50;
}

.items-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.item-card {
  background: white;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  text-align: center;
}
.item-card.low-stock {
  border: 2px solid #f44336;
}
.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.item-category {
  font-size: 0.7rem;
  background: #e8f5e9;
  padding: 2px 8px;
  border-radius: 10px;
  color: #2e7d32;
}
.item-card h3 {
  margin: 6px 0;
  font-size: 1rem;
}
.quantity-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
}
.quantity-controls button {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #ddd;
  background: #f5f5f5;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.quantity { font-size: 1.3rem; font-weight: bold; min-width: 30px; }
.low-label { color: #f44336; font-weight: bold; }
.remove-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #999;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #999;
}

.fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #4caf50;
  color: white;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}
.modal-form {
  background: white;
  border-radius: 20px 20px 0 0;
  padding: 24px;
  width: 100%;
  max-width: 500px;
}
.modal-form h2 { margin: 0 0 16px; }
.modal-form label {
  display: block;
  margin-bottom: 12px;
  font-size: 0.9rem;
  color: #555;
}
.modal-form input, .modal-form select {
  display: block;
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-top: 4px;
  font-size: 1rem;
  box-sizing: border-box;
}
.form-row { display: flex; gap: 12px; }
.form-row label { flex: 1; }
.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}
.form-actions button {
  flex: 1;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #ddd;
  background: white;
  font-size: 1rem;
  cursor: pointer;
}
.form-actions .primary {
  background: #4caf50;
  color: white;
  border-color: #4caf50;
}
</style>
