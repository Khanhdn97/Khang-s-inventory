
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './style.css'
import "./theme.css";
import ThemeToggle from "./ThemeToggle.tsx";
const API = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000'

type Warehouse = {
  id: number
  name: string
}

type WarehouseItem = {
  product_id: number
  sku: string
  quantity: number | string
}

type ProductRow = WarehouseItem & {
  warehouse_id: number
  warehouse_name: string
}

type CartItem = { id:number; product_id:number; sku:string; warehouse_id:number; warehouse_name:string; quantity:number|string }

type HistoryItem = {
  id: number
  action: string
  sku: string
  quantity: number | string
  warehouse_name?: string
  created_at?: string
  note?: string
}

type StoreCartRow = { id:number; name:string; quantity:number|string; unit_price:number|string; total:number|string }
type DebtCustomer = { id:number; name:string; debt_amount:number|string; updated_at?:string }
type StoreHistoryRow = { id:number; action:string; customer_name:string; item_name?:string|null; quantity:number|string; unit_price:number|string; amount:number|string; note?:string|null; created_at?:string }

type Dashboard = {
  total_quantity?: number
  warehouse_count?: number
  total_products?: number
  total_skus?: number
}

type Tab = 'Tổng quan' | 'Kho' | 'Hàng hóa' | 'Cửa hàng' | 'Lịch sử'

function numberValue(value: unknown): number {
  const result = Number(value ?? 0)
  return Number.isFinite(result) ? result : 0
}

function quantityFormat(value: unknown): string {
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 3,
  }).format(numberValue(value))
}

function moneyFormat(value: unknown): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numberValue(value))
}

function dateFormat(value: string | null | undefined) {
  if (!value) return '';

  // Đảm bảo thời gian UTC được nhận diện đúng
  const utcValue = /Z$|[+-]\d{2}:\d{2}$/.test(value)
    ? value
    : `${value}Z`;

  const date = new Date(utcValue);

  if (isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find(part => part.type === type)?.value ?? '';

  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

async function request<T = any>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  })

  if (!response.ok) {
    let message = `Lỗi HTTP ${response.status}`

    try {
      const data = await response.json()

      if (typeof data.detail === 'string') {
        message = data.detail
      } else if (Array.isArray(data.detail)) {
        message = data.detail
          .map((item: any) => item.msg || JSON.stringify(item))
          .join(', ')
      } else if (data.message) {
        message = data.message
      }
    } catch {
      // Giữ thông báo HTTP mặc định.
    }

    throw new Error(message)
  }

  if (response.status === 204) return undefined as T

  return response.json() as Promise<T>
}

/**
 * Chuẩn hóa dữ liệu hàng hóa.
 * Hỗ trợ backend trả về product_id hoặc id.
 */
function normalizeItem(raw: any): WarehouseItem {
  return {
    product_id: Number(raw.product_id ?? raw.id),
    sku: String(raw.sku ?? ''),
    quantity: raw.quantity ?? 0,
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('Tổng quan')

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [allWarehouseItems, setAllWarehouseItems] = useState<
    Record<number, WarehouseItem[]>
  >({})
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [showCartModal, setShowCartModal] = useState(false)
  const [recipientName, setRecipientName] = useState('')
  const [storeCart, setStoreCart] = useState<StoreCartRow[]>([])
  const [debts, setDebts] = useState<DebtCustomer[]>([])
  const [storeHistory, setStoreHistory] = useState<StoreHistoryRow[]>([])
  const [debtSearch, setDebtSearch] = useState('')
  const [showStoreCart, setShowStoreCart] = useState(false)
  const [invoicePreview, setInvoicePreview] = useState<null | { kind: 'stock' | 'store'; createdAt: string; customer: string; isDebt?: boolean; items: any[]; total: number }>(null)
  const [storeCustomerName, setStoreCustomerName] = useState('')
  const [storeIsDebt, setStoreIsDebt] = useState(false)
  const [storeItemName, setStoreItemName] = useState('')
  const [storeItemQuantity, setStoreItemQuantity] = useState('1')
  const [storeItemPrice, setStoreItemPrice] = useState('0')
  const [paymentCustomer, setPaymentCustomer] = useState<DebtCustomer | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(
    null,
  )

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [historyFilter, setHistoryFilter] = useState('ALL')

  // Thêm / sửa kho
  const [showWarehouseModal, setShowWarehouseModal] = useState(false)
  const [editingWarehouseId, setEditingWarehouseId] = useState<number | null>(
    null,
  )
  const [warehouseName, setWarehouseName] = useState('')

  // Tìm kiếm hàng hóa
  const [productSearch, setProductSearch] = useState('')

  // Nhập hàng
  const [showStockInModal, setShowStockInModal] = useState(false)
  const [inSku, setInSku] = useState('')
  const [inQuantity, setInQuantity] = useState('1')
  const [inWarehouseId, setInWarehouseId] = useState<number | ''>('')

  // Xuất hàng
  const [showStockOutModal, setShowStockOutModal] = useState(false)
  const [outProduct, setOutProduct] = useState<ProductRow | null>(null)
  const [outQuantity, setOutQuantity] = useState('1')

  // Popup sửa số lượng / chuyển kho.
  const [showEditProductModal, setShowEditProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null) 
  const [editQuantity, setEditQuantity] = useState('0')
  const [editWarehouseId, setEditWarehouseId] = useState<number | ''>('')


  const loadWarehouses = useCallback(async (): Promise<Warehouse[]> => {
    const data = await request<any[]>('/api/warehouses')

    const list: Warehouse[] = (Array.isArray(data) ? data : []).map(
      (item: any) => ({
        id: Number(item.id),
        name: String(item.name ?? ''),
      }),
    )

    setWarehouses(list)

    setSelectedWarehouseId((current) => {
      if (current !== null && list.some((item) => item.id === current)) {
        return current
      }

      return list[0]?.id ?? null
    })

    setInWarehouseId((current) => {
      if (current !== '' && list.some((item) => item.id === Number(current))) {
        return current
      }

      return list[0]?.id ?? ''
    })

    return list
  }, [])

  const loadItemsForWarehouse = useCallback(
    async (warehouseId: number): Promise<WarehouseItem[]> => {
      const data = await request<any[]>(
        `/api/warehouses/${warehouseId}/items`,
      )

      return (Array.isArray(data) ? data : []).map(normalizeItem)
    },
    [],
  )

  const loadHistory = useCallback(async (action = historyFilter) => {
    const query = new URLSearchParams({
      action,
      limit: '200',
    })

    const data = await request<HistoryItem[]>(
      `/api/history?${query.toString()}`,
    )

    setHistory(Array.isArray(data) ? data : [])
  }, [historyFilter])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [warehouseData, dashboardData, cartData] = await Promise.all([
        loadWarehouses(),
        request<Dashboard>('/api/dashboard'),
        request<CartItem[]>('/api/cart'),
      ])
      setCartItems(Array.isArray(cartData) ? cartData : [])

      setDashboard(dashboardData)

      const pairs = await Promise.all(
        warehouseData.map(async (warehouse) => {
          const items = await loadItemsForWarehouse(warehouse.id)
          return [warehouse.id, items] as const
        }),
      )

      const itemMap: Record<number, WarehouseItem[]> = {}

      for (const [id, items] of pairs) {
        itemMap[id] = items
      }

      setAllWarehouseItems(itemMap)

      const selectedId =
        selectedWarehouseId !== null &&
        warehouseData.some((item) => item.id === selectedWarehouseId)
          ? selectedWarehouseId
          : warehouseData[0]?.id ?? null

      setWarehouseItems(selectedId ? itemMap[selectedId] ?? [] : [])

      await loadHistory()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể tải dữ liệu. Hãy kiểm tra backend.',
      )
    } finally {
      setLoading(false)
    }
  }, [
    loadWarehouses,
    loadItemsForWarehouse,
    loadHistory,
    selectedWarehouseId,
  ])

  useEffect(() => {
    void refreshAll()
    // Tải dữ liệu ban đầu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedWarehouseId === null) {
      setWarehouseItems([])
      return
    }

    let cancelled = false

    loadItemsForWarehouse(selectedWarehouseId)
      .then((items) => {
        if (cancelled) return

        setWarehouseItems(items)

        setAllWarehouseItems((current) => ({
          ...current,
          [selectedWarehouseId]: items,
        }))
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Không tải được hàng trong kho.',
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedWarehouseId, loadItemsForWarehouse])

  const totalQuantity = useMemo(
    () =>
      Object.values(allWarehouseItems).reduce(
        (total, items) =>
          total +
          items.reduce(
            (sum, item) => sum + numberValue(item.quantity),
            0,
          ),
        0,
      ),
    [allWarehouseItems],
  )

  const totalSkuCount = useMemo(
    () =>
      new Set(
        Object.values(allWarehouseItems)
          .flat()
          .filter((item) => numberValue(item.quantity) > 0)
          .map((item) => item.sku),
      ).size,
    [allWarehouseItems],
  )

  const selectedWarehouse = warehouses.find(
    (warehouse) => warehouse.id === selectedWarehouseId,
  )

  const productRows = useMemo<ProductRow[]>(() => {
    return warehouses.flatMap((warehouse) =>
      (allWarehouseItems[warehouse.id] ?? []).map((item) => ({
        ...item,
        warehouse_id: warehouse.id,
        warehouse_name: warehouse.name,
      })),
    )
  }, [warehouses, allWarehouseItems])

  const filteredProductRows = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase()

    const rows = keyword
      ? productRows.filter((item) =>
          item.sku.toLowerCase().includes(keyword),
        )
      : productRows

    return [...rows].reverse()
  }, [productRows, productSearch])

  function openCreateWarehouse() {
    setEditingWarehouseId(null)
    setWarehouseName('')
    setError('')
    setShowWarehouseModal(true)
  }

  function openEditWarehouse(warehouse: Warehouse) {
    setEditingWarehouseId(warehouse.id)
    setWarehouseName(warehouse.name)
    setError('')
    setShowWarehouseModal(true)
  }

  function closeWarehouseModal() {
    setShowWarehouseModal(false)
    setEditingWarehouseId(null)
    setWarehouseName('')
  }

  async function saveWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = warehouseName.trim()

    if (!name) {
      setError('Vui lòng nhập tên kho.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')

    try {
      if (editingWarehouseId !== null) {
        await request(`/api/warehouses/${editingWarehouseId}`, {
          method: 'PUT',
          body: JSON.stringify({ name }),
        })

        setNotice('Đã cập nhật tên kho.')
      } else {
        const created = await request<Warehouse>('/api/warehouses', {
          method: 'POST',
          body: JSON.stringify({ name }),
        })

        if (created?.id) {
          setSelectedWarehouseId(created.id)
          setInWarehouseId(created.id)
        }

        setNotice('Đã tạo kho mới.')
      }
      await refreshAll()
      closeWarehouseModal()
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu kho.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteWarehouse(warehouse: Warehouse) {
    const confirmed = window.confirm(
      `Bạn có chắc muốn xóa kho "${warehouse.name}"?`,
    )

    if (!confirmed) return

    setError('')
    setNotice('')

    try {
      await request(`/api/warehouses/${warehouse.id}`, {
        method: 'DELETE',
      })

      setNotice(`Đã xóa kho "${warehouse.name}".`)
      await refreshAll()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể xóa kho. Hãy kiểm tra xem kho còn hàng hay không.',
      )
    }
  }

  async function deleteWarehouseItem(
    item: WarehouseItem,
    warehouseId: number | null = selectedWarehouseId,
  ) {
    if (warehouseId === null) return

    const confirmed = window.confirm(
      `Xóa mặt hàng "${item.sku}" khỏi kho này? Thao tác sẽ được ghi vào lịch sử.`,
    )

    if (!confirmed) return

    setError('')
    setNotice('')

    try {
      await request(
        `/api/warehouses/${warehouseId}/items/${item.product_id}`,
        { method: 'DELETE' },
      )

      setNotice(`Đã xóa mặt hàng ${item.sku} khỏi kho.`)
      await refreshAll()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể xóa mặt hàng.',
      )
    }
  }

  function openStockIn() {
    setInSku('')
    setInQuantity('1')
    setInWarehouseId(
      selectedWarehouseId ?? warehouses[0]?.id ?? '',
    )
    setError('')
    setNotice('')
    setShowStockInModal(true)
  }

  async function submitStockIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const sku = inSku.trim()
    const quantity = Number(inQuantity)
    const warehouseId = Number(inWarehouseId)

    if (!sku) {
      setError('Vui lòng nhập mã hàng.')
      return
    }

    if (!warehouseId || !warehouses.some((item) => item.id === warehouseId)) {
      setError('Vui lòng chọn một kho hợp lệ.')
      return
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Số lượng nhập phải lớn hơn 0.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')

    try {
      // Backend chỉ cần SKU, số lượng và kho.
      await request('/api/stock/in', {
        method: 'POST',
        body: JSON.stringify({
          sku,
          quantity,
          warehouse_id: warehouseId,
        }),
      })

      const warehouseName =
        warehouses.find((item) => item.id === warehouseId)?.name ?? ''

      setShowStockInModal(false)
      setNotice(
        `Nhập thành công ${quantityFormat(quantity)} đơn vị hàng ${sku} vào ${warehouseName}.`,
      )

      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể nhập hàng.')
    } finally {
      setSaving(false)
    }
  }

  function openStockOut(item: ProductRow) {
    setOutProduct(item)
    setOutQuantity('1')
    setError('')
    setNotice('')
    setShowStockOutModal(true)
  }

  async function submitStockOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!outProduct) return

    const quantity = Number(outQuantity)
    const available = numberValue(outProduct.quantity)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Số lượng xuất phải lớn hơn 0.')
      return
    }

    if (quantity > available) {
      setError(
        `Số lượng xuất không được vượt quá ${quantityFormat(available)}.`,
      )
      return
    }

    setSaving(true)
    setError('')
    setNotice('')

    try {
      await request('/api/cart/items', {
        method: 'POST',
        body: JSON.stringify({
          sku: outProduct.sku,
          quantity,
          warehouse_id: outProduct.warehouse_id,
        }),
      })

      const sku = outProduct.sku

      setShowStockOutModal(false)
      setOutProduct(null)
      setNotice(`Đã thêm ${quantityFormat(quantity)} đơn vị hàng ${sku} vào giỏ xuất. Số lượng đã tạm giữ khỏi kho.`)

      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xuất hàng.')
    } finally {
      setSaving(false)
    }
  }

async function removeCartItem(item: CartItem) {
  setSaving(true); setError(''); setNotice('')
  try {
    await request(`/api/cart/items/${item.id}`, { method: 'DELETE' })
    await refreshAll()
    setNotice(`Đã bỏ ${item.sku} khỏi giỏ và hoàn số lượng về kho.`)
  } catch (err) { setError(err instanceof Error ? err.message : 'Không thể bỏ hàng khỏi giỏ.') }
  finally { setSaving(false) }
}

async function confirmCart() {
  if (!recipientName.trim()) { setError('Vui lòng nhập tên người nhận.'); return }
  if (cartItems.length === 0) { setError('Giỏ hàng đang trống.'); return }
  setInvoicePreview({ kind: 'stock', createdAt: new Date().toLocaleString('vi-VN'), customer: recipientName.trim(), items: cartItems.map(x => ({ ...x })), total: cartItems.reduce((sum, x) => sum + numberValue(x.quantity), 0) })
  setShowCartModal(false)
}

async function finalizeStockInvoice(printInvoice: boolean) {
  if (!invoicePreview || invoicePreview.kind !== 'stock') return
  setSaving(true); setError('')
  try {
    await request('/api/cart/confirm', { method: 'POST', body: JSON.stringify({ recipient_name: invoicePreview.customer }) })
    if (printInvoice) window.print()
    setInvoicePreview(null); setRecipientName('')
    await refreshAll()
    setNotice('Đã xác nhận xuất hàng. Lịch sử xuất kho đã được cập nhật.')
  } catch (err) { setError(err instanceof Error ? err.message : 'Không thể xác nhận xuất hàng.'); setInvoicePreview(null); setShowCartModal(true) }
  finally { setSaving(false) }
}

function openEditProduct(item: ProductRow) {
  setEditingProduct(item)
  setEditQuantity(String(Number(item.quantity)))
  setEditWarehouseId(item.warehouse_id)
  setError('')
  setNotice('')
  setShowEditProductModal(true)
}

function closeEditProduct() {
  if (saving) return

  setShowEditProductModal(false)
  setEditingProduct(null)
  setEditQuantity('0')
  setEditWarehouseId('')
}

async function saveEditProduct(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()

  if (!editingProduct) return

  const quantity = Number(editQuantity)
  const targetWarehouseId = Number(editWarehouseId)
  const sourceWarehouseId = editingProduct.warehouse_id

  if (!Number.isFinite(quantity) || quantity < 1) {
    setError('Số lượng phải lớn hơn hoặc bằng 1.')
    return
  }

  // Giới hạn 3 chữ số thập phân theo kiểu dữ liệu Numeric(14, 3).
  if (Math.round(quantity * 1000) !== quantity * 1000) {
    setError('Số lượng chỉ được có tối đa 3 chữ số thập phân.')
    return
  }

  if (
    !targetWarehouseId ||
    !warehouses.some((warehouse) => warehouse.id === targetWarehouseId)
  ) {
    setError('Vui lòng chọn kho hợp lệ.')
    return
  }

  const isMoving = targetWarehouseId !== sourceWarehouseId
  const currentQuantity = numberValue(editingProduct.quantity)

  if (isMoving && quantity <= 1) {
    setError('Số lượng chuyển kho phải lớn hơn 1.')
    return
  }

  

  setSaving(true)
  setError('')
  setNotice('')

  try {
    await request(
      `/api/warehouses/${sourceWarehouseId}/items/${editingProduct.product_id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          quantity,
          target_warehouse_id: targetWarehouseId,
        }),
      },
    )

    const targetWarehouseName =
      warehouses.find((warehouse) => warehouse.id === targetWarehouseId)
        ?.name ?? 'kho đã chọn'

    setShowEditProductModal(false)
    setEditingProduct(null)
    setEditQuantity('0')
    setEditWarehouseId('')

    setNotice(
      isMoving
        ? `Đã chuyển ${quantityFormat(quantity)} đơn vị hàng ${
            editingProduct.sku
          } sang ${targetWarehouseName}.`
        : `Đã cập nhật số lượng hàng ${editingProduct.sku}.`,
    )

    await refreshAll()
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Không thể cập nhật mặt hàng.',
    )
  } finally {
    setSaving(false)
  }
}
  
  async function changeHistoryFilter(value: string) {
    setHistoryFilter(value)
    setError('')

    try {
      await loadHistory(value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải lịch sử.')
    }
  }
  async function deleteAllHistory() {
    const confirmed = window.confirm(
      'Bạn có chắc muốn xóa TOÀN BỘ lịch sử kho hàng không? ' +
        'Thao tác này không thể hoàn tác.',
    )

    if (!confirmed) return

    setSaving(true)
    setError('')
    setNotice('')

    try {
      await request('/api/history', {
        method: 'DELETE',
      })

      setHistory([])
      setNotice('Đã xóa toàn bộ lịch sử kho hàng.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể xóa lịch sử.',
      )
    } finally {
      setSaving(false)
    }
  }
  const refreshStore = useCallback(async () => {
    const [cartData, debtData, historyData] = await Promise.all([
      request<StoreCartRow[]>('/api/shop/cart'),
      request<DebtCustomer[]>(`/api/shop/debts?q=${encodeURIComponent(debtSearch)}`),
      request<StoreHistoryRow[]>('/api/shop/history'),
    ])
    setStoreCart(Array.isArray(cartData) ? cartData : [])
    setDebts(Array.isArray(debtData) ? debtData : [])
    setStoreHistory(Array.isArray(historyData) ? historyData : [])
  }, [debtSearch])

  useEffect(() => {
    if (tab === 'Cửa hàng') void refreshStore().catch((err) => setError(err instanceof Error ? err.message : 'Không tải được dữ liệu cửa hàng.'))
  }, [tab, refreshStore])

  async function addStoreCartItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const quantity = Number(storeItemQuantity)
    const unitPrice = Number(storeItemPrice)
    if (!storeItemName.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      setError('Vui lòng kiểm tra tên, số lượng và đơn giá.')
      return
    }
    setSaving(true); setError('')
    try {
      await request('/api/shop/cart', { method: 'POST', body: JSON.stringify({ name: storeItemName.trim(), quantity, unit_price: unitPrice }) })
      setStoreItemName(''); setStoreItemQuantity('1'); setStoreItemPrice('0')
      await refreshStore()
      setNotice('Đã thêm mặt hàng vào giỏ cửa hàng.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thể thêm mặt hàng.') }
    finally { setSaving(false) }
  }

  async function removeStoreCartItem(item: StoreCartRow) {
    setSaving(true)
    try { await request(`/api/shop/cart/${item.id}`, { method: 'DELETE' }); await refreshStore() }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thể xóa mặt hàng.') }
    finally { setSaving(false) }
  }

  async function checkoutStore() {
    if (!storeCustomerName.trim()) { setError('Vui lòng nhập tên khách hàng.'); return }
    if (!storeCart.length) { setError('Giỏ cửa hàng đang trống.'); return }
    setInvoicePreview({ kind: 'store', createdAt: new Date().toLocaleString('vi-VN'), customer: storeCustomerName.trim(), isDebt: storeIsDebt, items: storeCart.map(x => ({ ...x })), total: storeCart.reduce((sum, item) => sum + numberValue(item.total), 0) })
    setShowStoreCart(false)
  }

  async function finalizeStoreInvoice(printInvoice: boolean) {
    if (!invoicePreview || invoicePreview.kind !== 'store') return
    setSaving(true); setError('')
    try {
      await request('/api/shop/checkout', { method: 'POST', body: JSON.stringify({ customer_name: invoicePreview.customer, is_debt: Boolean(invoicePreview.isDebt) }) })
      if (printInvoice) window.print()
      setInvoicePreview(null); setStoreCustomerName(''); setStoreIsDebt(false)
      await refreshStore()
      setNotice(invoicePreview.isDebt ? 'Đã ghi nhận giao dịch và cộng khoản nợ cho khách.' : 'Đã hoàn tất giao dịch cửa hàng.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thể hoàn tất giao dịch.'); setInvoicePreview(null); setShowStoreCart(true) }
    finally { setSaving(false) }
  }

  function openTakeMore(customer: DebtCustomer) {
    setStoreCustomerName(customer.name); setStoreIsDebt(true); setShowStoreCart(true)
  }

  function openDebtPayment(customer: DebtCustomer) {
    setPaymentCustomer(customer); setPaymentAmount(''); setShowPaymentModal(true)
  }

  async function submitDebtPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!paymentCustomer) return
    const amount = Number(paymentAmount)
    if (!Number.isFinite(amount) || amount <= 0) { setError('Số tiền trả phải lớn hơn 0.'); return }
    setSaving(true); setError('')
    try {
      await request(`/api/shop/debts/${paymentCustomer.id}/payment`, { method: 'POST', body: JSON.stringify({ amount }) })
      setShowPaymentModal(false); setPaymentCustomer(null); await refreshStore()
      setNotice('Đã cập nhật khoản thanh toán nợ.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thể cập nhật khoản nợ.') }
    finally { setSaving(false) }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">K</div>
          <div>
            <strong>Kho Của Kháng</strong>
            <small>Kháng's INVENTORY</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          {(
            [
              ['Tổng quan', '◫'],
              ['Hàng hóa', '▦'],
              ['Cửa hàng', '🛒'],
              ['Kho', '▤'],
              ['Lịch sử', '◷'],
            ] as [Tab, string][]
          ).map(([name, icon]) => (
            <button
              type="button"
              key={name}
              className={`nav-item ${tab === name ? 'active' : ''}`}
              onClick={() => setTab(name)}
            >
              <span className="nav-icon">{icon}</span>
              <span>{name}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" />
          Kết nối dữ liệu kho
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">QUẢN LÝ KHO HÀNG</span>
            <h1>{tab}</h1>
          </div>
          <ThemeToggle />
          <button
            type="button"
            className="button secondary refresh-button"
            onClick={() => void refreshAll()}
            disabled={loading}
          >
            ↻ {loading ? 'Đang tải...' : 'Làm mới'}
          </button>
        </header>

        {error && (
          <div className="alert alert-error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              aria-label="Đóng thông báo"
            >
              ×
            </button>
          </div>
        )}

        {notice && (
          <div className="alert alert-success" role="status">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice('')}
              aria-label="Đóng thông báo"
            >
              ×
            </button>
          </div>
        )}

        {/* TỔNG QUAN */}
        {tab === 'Tổng quan' && (
          <section className="page-content">
            <div className="welcome-row">
              <div>
                <h2>Tổng quan kho hàng</h2>
                <p className="muted">
                  Theo dõi số lượng hàng và tình trạng các kho của bạn.
                </p>
              </div>

              <button
                type="button"
                className="button"
                onClick={openCreateWarehouse}
              >
                + Thêm kho mới
              </button>
            </div>

            <div className="metric-grid">

              <Metric
                icon="▦"
                title="Tổng lượng hàng"
                value={quantityFormat(
                  dashboard?.total_quantity ?? totalQuantity,
                )}
                detail="Tổng số lượng trong các kho"
              />

              <Metric
                icon="◈"
                title="Mã hàng đang tồn"
                value={totalSkuCount}
                detail="Các Mã hàng có số lượng lớn hơn 0"
              />
              <Metric
                icon="▤"
                title="Tổng số kho"
                value={warehouses.length}
                detail="Kho đã được tạo"
              />
            </div>

            <section className="panel card">
              <div className="panel-head">
                <div>
                  <h2>Hàng hóa theo kho</h2>
                  <p className="muted">
                    Chọn một kho để xem chi tiết hàng hóa.
                  </p>
                </div>

                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setTab('Kho')}
                >
                  Quản lý kho
                </button>
              </div>

              {warehouses.length === 0 ? (
                <EmptyState
                  title="Chưa có kho hàng"
                  description="Tạo kho đầu tiên để bắt đầu quản lý hàng hóa."
                  action={
                    <button
                      type="button"
                      className="button"
                      onClick={openCreateWarehouse}
                    >
                      + Thêm kho mới
                    </button>
                  }
                />
              ) : (
                <div className="overview-warehouse-grid">
                  {warehouses.map((warehouse) => {
                    const items = allWarehouseItems[warehouse.id] ?? []
                    const quantity = items.reduce(
                      (sum, item) => sum + numberValue(item.quantity),
                      0,
                    )

                    return (
                      <button
                        type="button"
                        className="overview-warehouse-card btn-manage-warehouse"
                        key={warehouse.id}
                        onClick={() => {
                          setSelectedWarehouseId(warehouse.id)
                          setTab('Kho')
                        }}
                      >
                        <div className="warehouse-card-icon">▤</div>

                        <div className="warehouse-card-content">
                          <strong>{warehouse.name}</strong>
                          <span>{items.length} mã hàng</span>
                        </div>

                        <div className="warehouse-card-quantity">
                          <strong>{quantityFormat(quantity)}</strong>
                          <span>đơn vị</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          </section>
        )}

        {/* KHO */}
        {tab === 'Kho' && (
          <section className="page-content warehouse-page">
            <div className="warehouse-heading panel card">
              <div>
                <h2>Hàng trong kho</h2>
                <p className="muted">
                  Chọn kho để xem số lượng hàng hóa đang được lưu trữ.
                </p>
              </div>

              <button
                type="button"
                className="button"
                onClick={openCreateWarehouse}
              >
                + Thêm kho mới
              </button>
            </div>

            <div className="warehouse-layout">
              <aside className="panel warehouse-list card">
                <div className="panel-head">
                  <div>
                    <h3>Danh sách kho</h3>
                    <p className="muted">Chọn kho cần xem.</p>
                  </div>

                  <span className="count-badge">{warehouses.length}</span>
                </div>

                {warehouses.length === 0 ? (
                  <EmptyState
                    title="Chưa có kho"
                    description="Nhấn Thêm kho mới để tạo kho đầu tiên."
                  />
                ) : (
                  <div className="warehouse-options">
                    {warehouses.map((warehouse) => {
                      const items = allWarehouseItems[warehouse.id] ?? []
                      const quantity = items.reduce(
                        (sum, item) => sum + numberValue(item.quantity),
                        0,
                      )

                      return (
                        <div
                          className={`warehouse-option ${
                            selectedWarehouseId === warehouse.id ? 'active' : ''
                          }`}
                          key={warehouse.id}
                          onClick={() =>
                              setSelectedWarehouseId(warehouse.id)
                          }
                        >
                          <button
                            type="button"
                            className="warehouse-select"
                          >
                            <span className="warehouse-small-icon">▤</span>

                            <span className="warehouse-select-text">
                              <strong>{warehouse.name}</strong>
                              <small>
                                {items.length} mã hàng ·{' '}
                                {quantityFormat(quantity)} đơn vị
                              </small>
                            </span>

                            {selectedWarehouseId === warehouse.id && (
                              <span className="selected-check">✓</span>
                            )}
                          </button>

                          <div className="warehouse-actions">
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => openEditWarehouse(warehouse)}
                            >
                              Sửa
                            </button>

                            <button
                              type="button"
                              className="text-button danger-text"
                              onClick={() => void deleteWarehouse(warehouse)}
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </aside>

              <section className="panel warehouse-items card">
                <div className="panel-head warehouse-items-head">
                  <div>
                    <span className="eyebrow">KHO ĐANG CHỌN</span>
                    <h2>{selectedWarehouse?.name ?? 'Hàng trong kho'}</h2>
                    <p className="muted">
                      Danh sách Mã hàng và số lượng hiện có.
                    </p>
                  </div>

                  {selectedWarehouse && (
                    <span className="count-badge">
                      {warehouseItems.length} mã hàng
                    </span>
                  )}
                </div>

                {!selectedWarehouseId ? (
                  <EmptyState
                    title="Chưa có kho được chọn"
                    description="Hãy tạo kho mới hoặc chọn kho trong danh sách bên trái."
                    action={
                      <button
                        type="button"
                        className="button"
                        onClick={openCreateWarehouse}
                      >
                        + Thêm kho mới
                      </button>
                    }
                  />
                ) : warehouseItems.length === 0 ? (
                  <EmptyState
                    title="Kho này chưa có hàng"
                    description="Vào trang Hàng hóa để nhập hàng vào kho này."
                    action={
                      <button
                        type="button"
                        className="button"
                        onClick={() => {
                          setTab('Hàng hóa')
                          openStockIn()
                        }}
                      >
                        + Nhập hàng
                      </button>
                    }
                  />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Mã hàng</th>
                          <th className="numeric-cell">Số lượng</th>
                          <th className="action-cell">Thao tác</th>
                        </tr>
                      </thead>

                      <tbody>
                        {warehouseItems.map((item) => (
                          <tr key={item.product_id}>
                            <td>
                              <span className="sku-badge">{item.sku}</span>
                            </td>

                            <td className="numeric-cell quantity-cell">
                              {quantityFormat(item.quantity)}
                            </td>

                            <td className="action-cell">
                              <button
                                type="button"
                                className="text-button danger-text history-badge history-delete"
                                onClick={() => void deleteWarehouseItem(item)}
                              >
                                Xóa hàng
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedWarehouse && warehouseItems.length > 0 && (
                  <div className="warehouse-total">
                    <span>Tổng số lượng trong kho</span>
                    <strong>
                      {quantityFormat(
                        warehouseItems.reduce(
                          (sum, item) => sum + numberValue(item.quantity),
                          0,
                        ),
                      )}
                    </strong>
                  </div>
                )}
              </section>
            </div>
          </section>
        )}

        {/* HÀNG HÓA */}
        {tab === 'Hàng hóa' && (
          <section className="page-content">
            <div className="welcome-row">
              <div>
                <h2>Danh sách hàng hóa</h2>
                <p className="muted">
                  Quản lý Mã hàng, số lượng, kho lưu trữ và giao dịch xuất hàng.
                </p>
              </div>

              
            </div>

            <section className="panel card">
              <div className="panel-head">
                <div>
                  <h2>Hàng hóa</h2>
                  <span className="count-badge">
                    {filteredProductRows.length} mặt hàng
                  </span>
                </div>
                <div className="product-header-actions">
                <button type="button" className="button secondary cart-open-button" onClick={() => { setError(''); setShowCartModal(true) }}>
                  🛒 Giỏ hàng <span className="cart-count">{cartItems.length}</span>
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={openStockIn}
                  disabled={warehouses.length === 0}
                >
                  + Nhập hàng
                </button>
                </div>
                </div>

              <div className="product-search">
                <input
                  className="store-search product-search-input"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Tìm hàng theo mã..."
                  aria-label="Tìm kiếm theo Mã hàng"
                />
              </div>

              {warehouses.length === 0 ? (
                <EmptyState
                  title="Chưa có kho hàng"
                  description="Bạn cần tạo kho trước khi nhập hoặc quản lý hàng hóa."
                  action={
                    <button
                      type="button"
                      className="button"
                      onClick={openCreateWarehouse}
                    >
                      + Thêm kho mới
                    </button>
                  }
                />
              ) : filteredProductRows.length === 0 ? (
                <EmptyState
                  title="Không tìm thấy hàng hóa"
                  description={
                    productSearch.trim()
                      ? `Không có Mã hàng phù hợp với "${productSearch.trim()}".`
                      : 'Chưa có hàng trong các kho. Hãy nhấn Nhập hàng để bắt đầu.'
                  }
                  action={
                    !productSearch.trim() ? (
                      <button
                        type="button"
                        className="button"
                        onClick={openStockIn}
                      >
                        + Nhập hàng
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Mã hàng</th>
                        <th className="numeric-cell">Kho</th>
                        <th className="numeric-cell">Số lượng</th>
                        <th className="action-cell">Thao tác</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredProductRows.map((item) => (
                        <tr
                          key={`${item.warehouse_id}-${item.product_id}`}
                        >
                          <td>
                            <span className="sku-badge">{item.sku}</span>
                          </td>

                          <td className="numeric-cell quantity-cell">{item.warehouse_name}</td>

                          <td className="numeric-cell quantity-cell">
                            {quantityFormat(item.quantity)}
                          </td>

                          <td className="action-cell">
                            <div className="product-actions">
                              <button
                                type="button"
                                className="text-button danger-text history-badge history-delete"
                                onClick={() => void deleteWarehouseItem(item)}
                              >
                                Xóa ✕
                              </button>
                              <button
                                type="button"
                                className="text-button history-badge history-edit"
                                onClick={() => openEditProduct(item)}
                              >
                                Sửa ✎
                              </button>

                              <button
                                type="button"
                                className="text-button history-badge history-out"
                                onClick={() => openStockOut(item)}
                                disabled={numberValue(item.quantity) <= 0}
                              >
                                Xuất ✔
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </section>
        )}

        {/* CỬA HÀNG */}
        {tab === 'Cửa hàng' && (
          <section className="page-content">
            <div className="panel card">
              <div className="panel-head">
                <div><h2>Cửa hàng</h2><p className="muted">Tạo giao dịch bán hàng thủ công và theo dõi công nợ khách hàng.</p></div>
                <button type="button" className="button" onClick={() => { setStoreCustomerName(''); setStoreIsDebt(false); setShowStoreCart(true) }}>🛒 Giỏ hàng ({storeCart.length})</button>
              </div>
              <div className="store-debt-head">
                <div><h2>Danh sách khách nợ</h2><p className="muted">Khách có khoản nợ lớn hơn 0 USD.</p></div>
                <input className="store-search" value={debtSearch} onChange={(e) => setDebtSearch(e.target.value)} placeholder="Tìm khách theo tên..." />
              </div>
              {debts.length === 0 ? <EmptyState title="Không có khách nợ" description="Khách hàng được ghi nợ sẽ xuất hiện tại đây." /> : (
                <div className="table-wrap"><table><thead><tr><th>Tên khách hàng</th><th className="numeric-cell">Số tiền nợ (USD)</th><th>Thời gian cập nhật</th><th className="action-cell">Thao tác</th></tr></thead><tbody>
                  {debts.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td className="numeric-cell debt-amount">${moneyFormat(customer.debt_amount)}</td><td>{dateFormat(customer.updated_at)}</td><td className="action-cell"><button type="button" className="text-button history-badge history-in" onClick={() => openDebtPayment(customer)}>Trả nợ</button><button type="button" className="text-button history-badge history-out" onClick={() => openTakeMore(customer)}>Lấy thêm</button></td></tr>)}
                </tbody></table></div>
              )}
            </div>
            <div className="panel card">
              <div className="panel-head"><div><h2>Lịch sử cửa hàng</h2><p className="muted">Các giao dịch bán hàng, ghi nợ và trả nợ.</p></div></div>
              {storeHistory.length === 0 ? <EmptyState title="Chưa có giao dịch" description="Lịch sử thao tác tại cửa hàng sẽ hiển thị ở đây." /> : (
                <div className="table-wrap"><table><thead><tr><th>Thời gian</th><th>Khách hàng</th><th>Mặt hàng</th><th>Số lượng</th><th>Đơn giá</th><th>Số tiền (USD)</th><th>Thao tác</th></tr></thead><tbody>
                  {storeHistory.map((row) => <tr key={row.id}><td>{dateFormat(row.created_at)}</td><td>{row.customer_name}</td><td>{row.item_name || '—'}</td><td className="numeric-cell">{quantityFormat(row.quantity)}</td><td className="numeric-cell">${moneyFormat(row.unit_price)}</td><td className="numeric-cell">${moneyFormat(row.amount)}</td><td>{row.action === 'DEBT_PAYMENT' ? 'Trả nợ' : row.action === 'SALE_DEBT' ? 'Bán ghi nợ' : 'Bán hàng'}</td></tr>)}
                </tbody></table></div>
              )}
            </div>
          </section>
        )}

        {/* LỊCH SỬ */}
        {tab === 'Lịch sử' && (
          <section className="page-content">
            <div className="panel card">
              <div className="panel-head history-heading">
                <div>
                  <h2>Lịch sử kho hàng</h2>
                  <p className="muted">
                    Theo dõi các giao dịch nhập, xuất, xóa và chuyển kho.
                  </p>
                </div>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void deleteAllHistory()}
                  disabled={saving || history.length === 0}
                >
                  {saving ? 'Đang xóa...' : 'Xóa toàn bộ lịch sử'}
                </button>
                <label className="history-filter">
                  <span>Lọc theo thao tác</span>

                  <select
                    value={historyFilter}
                    onChange={(event) =>
                      void changeHistoryFilter(event.target.value)
                    }
                  >
                    <option value="ALL">Tất cả thao tác</option>
                    <option value="IN">Nhập hàng</option>
                    <option value="OUT">Xuất hàng</option>
                    <option value="DELETE">Xóa hàng</option>
                    <option value="EDIT">Sửa thông tin</option>
                  </select>
                </label>
              </div>

              {history.length === 0 ? (
                <EmptyState
                  title="Chưa có lịch sử"
                  description="Các giao dịch được backend ghi nhận sẽ xuất hiện tại đây."
                />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Mã hàng</th>
                        <th>Thời gian</th>
                        <th>Thao tác</th>
                        <th className="numeric-cell">Kho</th>
                        <th className="numeric-cell">Số lượng</th>
                        <th>Ghi chú</th>
                      </tr>
                    </thead>

                    <tbody>
                      {history.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <span className="sku-badge">
                              {item.sku || '—'}
                            </span>
                          </td>

                          <td>{dateFormat(item.created_at)}</td>

                          <td>
                            <HistoryBadge action={item.action} />
                          </td>

                          <td>{item.warehouse_name || '—'}</td>

                          <td className="numeric-cell">
                            {quantityFormat(item.quantity)}
                          </td>

                          <td>{item.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        <footer className="app-footer">
          Inventory Cloud <span>·</span> Dữ liệu được lưu trên máy chủ.
        </footer>
      </main>

      {/* POPUP THÊM / SỬA KHO */}
      {showWarehouseModal && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeWarehouseModal()
          }}
        >
          <section
            className="warehouse-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="warehouse-modal-title"
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">QUẢN LÝ KHO</span>

                <h2 id="warehouse-modal-title">
                  {editingWarehouseId !== null ? 'Sửa tên kho' : 'Thêm kho mới'}
                </h2>

                <p className="muted">
                  Mỗi kho chỉ cần một tên duy nhất.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                aria-label="Đóng popup"
                onClick={closeWarehouseModal}
              >
                ×
              </button>
            </div>

            <form className="form" onSubmit={saveWarehouse}>
              <label className="form-field">
                <span className="field-label">Tên kho *</span>

                <input
                  autoFocus
                  required
                  value={warehouseName}
                  onChange={(event) => setWarehouseName(event.target.value)}
                  placeholder="Ví dụ: Kho Đà Nẵng"
                  maxLength={100}
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={closeWarehouseModal}
                  disabled={saving}
                >
                  Hủy
                </button>

                <button type="submit" className="button" disabled={saving}>
                  {saving
                    ? 'Đang lưu...'
                    : editingWarehouseId !== null
                      ? 'Lưu thay đổi'
                      : 'Tạo kho'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* XEM TRƯỚC HÓA ĐƠN CHUNG CHO HAI GIỎ HÀNG */}
      {invoicePreview && (
        <div className="modal-overlay invoice-preview-overlay">
          <section className="invoice-preview" role="dialog" aria-modal="true" aria-labelledby="invoice-preview-title">
            <div className="invoice-paper" id="invoice-print-area">
              <div className="invoice-heading"><span className="eyebrow">{invoicePreview.kind === 'stock' ? 'PHIẾU XUẤT KHO' : 'HÓA ĐƠN BÁN HÀNG'}</span><h2 id="invoice-preview-title">HÓA ĐƠN</h2><p>Thời gian: {invoicePreview.createdAt}</p><p>{invoicePreview.kind === 'stock' ? 'Người nhận' : 'Khách hàng'}: <strong>{invoicePreview.customer}</strong></p>{invoicePreview.kind === 'store' && <p>Hình thức: <strong>{invoicePreview.isDebt ? 'Ghi nợ' : 'Đã thanh toán'}</strong></p>}</div>
              <table><thead><tr>{invoicePreview.kind === 'stock' ? <><th>Mã hàng</th><th>Kho</th><th className="numeric-cell">Số lượng</th></> : <><th>Mặt hàng</th><th className="numeric-cell">Số lượng</th><th className="numeric-cell">Đơn giá (USD)</th><th className="numeric-cell">Thành tiền (USD)</th></>}</tr></thead><tbody>
                {invoicePreview.items.map((item, index) => <tr key={`${item.id}-${index}`}>{invoicePreview.kind === 'stock' ? <><td>{item.sku}</td><td>{item.warehouse_name}</td><td className="numeric-cell">{quantityFormat(item.quantity)}</td></> : <><td>{item.name}</td><td className="numeric-cell">{quantityFormat(item.quantity)}</td><td className="numeric-cell">${moneyFormat(item.unit_price)}</td><td className="numeric-cell">${moneyFormat(item.total ?? numberValue(item.quantity) * numberValue(item.unit_price))}</td></>}</tr>)}
              </tbody></table>
              <div className="invoice-total">{invoicePreview.kind === 'stock' ? <>Tổng số lượng: <strong>{quantityFormat(invoicePreview.total)}</strong></> : <>Tổng thanh toán: <strong>${moneyFormat(invoicePreview.total)} USD</strong></>}</div>
              <p className="invoice-thanks">Cảm ơn!</p>
            </div>
            <div className="modal-actions invoice-actions"><button type="button" className="button secondary" onClick={() => { const kind = invoicePreview.kind; setInvoicePreview(null); if (kind === 'stock') setShowCartModal(true); else setShowStoreCart(true) }} disabled={saving}>← Quay lại giỏ hàng</button><button type="button" className="button secondary" onClick={() => void (invoicePreview.kind === 'stock' ? finalizeStockInvoice(false) : finalizeStoreInvoice(false))} disabled={saving}>Không xuất hóa đơn</button><button type="button" className="button" onClick={() => void (invoicePreview.kind === 'stock' ? finalizeStockInvoice(true) : finalizeStoreInvoice(true))} disabled={saving}>{saving ? 'Đang xử lý...' : 'Xuất hóa đơn / In'}</button></div>
          </section>
        </div>
      )}

      {/* POPUP GIỎ HÀNG CỬA HÀNG */}
      {showStoreCart && (
        <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowStoreCart(false) }}>
          <section className="warehouse-modal stock-cart-modal shop-cart-modal" role="dialog" aria-modal="true" aria-labelledby="shop-cart-title">
            <div className="modal-header"><div><span className="eyebrow">CỬA HÀNG</span><h2 id="shop-cart-title">Giỏ hàng cửa hàng</h2><p className="muted">Nhập thủ công tên mặt hàng, số lượng và đơn giá USD.</p></div><button type="button" className="modal-close" onClick={() => setShowStoreCart(false)}>×</button></div>
            <form className="form shop-add-form" onSubmit={addStoreCartItem}>
              <label className="form-field"><span className="field-label">Tên mặt hàng *</span><input required value={storeItemName} onChange={(e) => setStoreItemName(e.target.value)} placeholder="Tên mặt hàng" /></label>
              <label className="form-field"><span className="field-label">Số lượng *</span><input required type="number" min="0.001" step="any" value={storeItemQuantity} onChange={(e) => setStoreItemQuantity(e.target.value)} /></label>
              <label className="form-field"><span className="field-label">Đơn giá (USD) *</span><input required type="number" min="0" step="0.01" value={storeItemPrice} onChange={(e) => setStoreItemPrice(e.target.value)} /></label>
              <button type="submit" className="button" disabled={saving}>+ Thêm mặt hàng</button>
            </form>
            {storeCart.length === 0 ? <EmptyState title="Giỏ hàng đang trống" description="Nhập thông tin mặt hàng phía trên để thêm vào giỏ." /> : (
              <div className="table-wrap cart-table-wrap"><table><thead><tr><th>Tên mặt hàng</th><th className="numeric-cell">Số lượng</th><th className="numeric-cell">Đơn giá</th><th className="numeric-cell">Thành tiền</th><th>Thao tác</th></tr></thead><tbody>
                {storeCart.map((item) => <tr key={item.id}><td>{item.name}</td><td className="numeric-cell">{quantityFormat(item.quantity)}</td><td className="numeric-cell">${moneyFormat(item.unit_price)}</td><td className="numeric-cell">${moneyFormat(item.total)}</td><td><button type="button" className="text-button danger-text" disabled={saving} onClick={() => void removeStoreCartItem(item)}>Xóa</button></td></tr>)}
              </tbody></table></div>
            )}
            <div className="shop-cart-total">Tổng cộng: <strong>${moneyFormat(storeCart.reduce((sum, item) => sum + numberValue(item.total), 0))} USD</strong></div>
            <label className="form-field cart-recipient-field"><span className="field-label">Tên khách hàng *</span><input value={storeCustomerName} onChange={(e) => setStoreCustomerName(e.target.value)} placeholder="Nhập tên khách hàng" maxLength={200} /></label>
            <label className="shop-debt-checkbox"><input type="checkbox" checked={storeIsDebt} onChange={(e) => setStoreIsDebt(e.target.checked)} /> Khách hàng nợ tiền (cộng vào công nợ)</label>
            <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowStoreCart(false)} disabled={saving}>Đóng</button><button type="button" className="button" onClick={() => void checkoutStore()} disabled={saving || !storeCart.length || !storeCustomerName.trim()}>{saving ? 'Đang lưu...' : storeIsDebt ? 'Xác nhận bán và ghi nợ' : 'Xác nhận bán hàng'}</button></div>
          </section>
        </div>
      )}

      {/* POPUP TRẢ NỢ */}
      {showPaymentModal && paymentCustomer && (
        <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowPaymentModal(false) }}>
          <section className="warehouse-modal" role="dialog" aria-modal="true" aria-labelledby="debt-payment-title">
            <div className="modal-header"><div><span className="eyebrow">CÔNG NỢ</span><h2 id="debt-payment-title">Khách trả nợ</h2><p className="muted">{paymentCustomer.name}</p></div><button type="button" className="modal-close" onClick={() => setShowPaymentModal(false)}>×</button></div>
            <div className="product-summary"><div><span>Khoản nợ hiện tại</span><strong>${moneyFormat(paymentCustomer.debt_amount)} USD</strong></div></div>
            <form className="form" onSubmit={submitDebtPayment}>
              <label className="form-field"><span className="field-label">Số tiền khách trả (USD) *</span><input autoFocus required type="number" min="0.01" max={numberValue(paymentCustomer.debt_amount)} step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></label>
              <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowPaymentModal(false)} disabled={saving}>Hủy</button><button type="submit" className="button" disabled={saving}>{saving ? 'Đang lưu...' : 'Xác nhận trả nợ'}</button></div>
            </form>
          </section>
        </div>
      )}

      {/* POPUP GIỎ HÀNG XUẤT KHO */}
      {showCartModal && (
        <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowCartModal(false) }}>
          <section className="warehouse-modal stock-cart-modal" role="dialog" aria-modal="true" aria-labelledby="stock-cart-title">
            <div className="modal-header">
              <div><span className="eyebrow">XUẤT KHO</span><h2 id="stock-cart-title">Giỏ hàng xuất kho</h2><p className="muted">Các mặt hàng trong giỏ đã được tạm giữ khỏi tồn kho.</p></div>
              <button type="button" className="modal-close" aria-label="Đóng popup" onClick={() => setShowCartModal(false)}>×</button>
            </div>
            {cartItems.length === 0 ? (
              <EmptyState title="Giỏ hàng đang trống" description="Chọn Xuất ở danh sách hàng hóa để thêm mặt hàng vào đây." />
            ) : (
              <div className="table-wrap cart-table-wrap"><table><thead><tr><th>Mã hàng</th><th>Kho</th><th className="numeric-cell">Số lượng</th><th className="action-cell">Thao tác</th></tr></thead><tbody>
                {cartItems.map((item) => <tr key={item.id}><td><span className="sku-badge">{item.sku}</span></td><td>{item.warehouse_name}</td><td className="numeric-cell quantity-cell">{quantityFormat(item.quantity)}</td><td className="action-cell"><button type="button" className="text-button danger-text" disabled={saving} onClick={() => void removeCartItem(item)}>Bỏ khỏi giỏ ✕</button></td></tr>)}
              </tbody></table></div>
            )}
            <label className="form-field cart-recipient-field"><span className="field-label">Tên người nhận *</span><input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Nhập tên người nhận hàng" maxLength={200} /></label>
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setShowCartModal(false)} disabled={saving}>Đóng</button>
              <button type="button" className="button" onClick={() => void confirmCart()} disabled={saving || cartItems.length === 0 || !recipientName.trim()}>{saving ? 'Đang xác nhận...' : 'Xác nhận xuất hàng'}</button>
            </div>
          </section>
        </div>
      )}

      {/* POPUP NHẬP HÀNG */}
      {showStockInModal && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowStockInModal(false)
            }
          }}
        >
          <section
            className="warehouse-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-in-title"
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">NHẬP KHO</span>
                <h2 id="stock-in-title">Nhập hàng</h2>
                <p className="muted">
                  Nhập Mã hàng, số lượng và kho nhận hàng.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                aria-label="Đóng popup"
                onClick={() => setShowStockInModal(false)}
              >
                ×
              </button>
            </div>

            <form className="form" onSubmit={submitStockIn}>
              <label className="form-field">
                <span className="field-label">Mã hàng *</span>

                <input
                  required
                  autoFocus
                  autoComplete="off"
                  value={inSku}
                  onChange={(event) => setInSku(event.target.value)}
                  placeholder="Ví dụ: SP001"
                  maxLength={80}
                />
              </label>

              <label className="form-field">
                <span className="field-label">Số lượng nhập *</span>

                <input
                  type="number"
                  required
                  min="0.001"
                  step="any"
                  value={inQuantity}
                  onChange={(event) => setInQuantity(event.target.value)}
                />
              </label>

              <label className="form-field">
                <span className="field-label">Kho nhập *</span>

                <select
                  required
                  value={inWarehouseId}
                  onChange={(event) =>
                    setInWarehouseId(
                      event.target.value ? Number(event.target.value) : '',
                    )
                  }
                >
                  <option value="">-- Chọn kho --</option>

                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>

              <p className="field-hint">
                Mỗi Mã hàng chỉ thuộc một kho tại một thời điểm. Nếu Mã hàng đã nằm ở
                kho khác, hãy dùng chức năng Chuyển kho.
              </p>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setShowStockInModal(false)}
                  disabled={saving}
                >
                  Hủy
                </button>

                <button type="submit" className="button" disabled={saving}>
                  {saving ? 'Đang nhập...' : 'Xác nhận nhập hàng'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* POPUP XUẤT HÀNG */}
      {showStockOutModal && outProduct && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowStockOutModal(false)
            }
          }}
        >
          <section
            className="warehouse-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-out-title"
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">XUẤT KHO</span>
                <h2 id="stock-out-title">Xuất hàng</h2>
                <p className="muted">
                  Chọn số lượng cần đưa vào giỏ xuất. Hàng sẽ tạm thời không còn trong kho.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                aria-label="Đóng popup"
                onClick={() => setShowStockOutModal(false)}
              >
                ×
              </button>
            </div>

            <div className="product-summary">
              <div>
                <span>Mã hàng</span>
                <strong>{outProduct.sku}</strong>
              </div>

              <div>
                <span>Kho xuất</span>
                <strong>{outProduct.warehouse_name}</strong>
              </div>

              <div>
                <span>Số lượng hiện có</span>
                <strong>{quantityFormat(outProduct.quantity)}</strong>
              </div>
            </div>

            <form className="form" onSubmit={submitStockOut}>
              <label className="form-field">
                <span className="field-label">Số lượng xuất *</span>

                <input
                  type="number"
                  required
                  min="0.001"
                  max={numberValue(outProduct.quantity)}
                  step="any"
                  value={outQuantity}
                  onChange={(event) => setOutQuantity(event.target.value)}
                />

                <small className="field-hint">
                  Tối đa {quantityFormat(outProduct.quantity)} đơn vị.
                </small>
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setShowStockOutModal(false)}
                  disabled={saving}
                >
                  Hủy
                </button>

                <button type="submit" className="button" disabled={saving}>
                  {saving ? 'Đang thêm...' : 'Thêm vào giỏ hàng'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* POPUP SỬA SỐ LƯỢNG / CHUYỂN KHO */}
      {showEditProductModal && editingProduct && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEditProduct()
            }
          }}
        >
          <section
            className="warehouse-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-product-title"
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">QUẢN LÝ TỒN KHO</span>
                <h2 id="edit-product-title">Sửa mặt hàng</h2>
                <p className="muted">
                  Điều chỉnh số lượng tồn hoặc chuyển hàng sang kho khác.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                aria-label="Đóng popup"
                onClick={closeEditProduct}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <div className="product-summary">
              <div>
                <span>Mã mặt hàng</span>
                <strong>{editingProduct.sku}</strong>
              </div>

              <div>
                <span>Kho hiện tại</span>
                <strong>{editingProduct.warehouse_name}</strong>
              </div>

              <div>
                <span>Tồn hiện tại</span>
                <strong>{quantityFormat(editingProduct.quantity)}</strong>
              </div>
            </div>

            <form className="form" onSubmit={saveEditProduct}>
              <label className="form-field">
                <span className="field-label">Số lượng *</span>

                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={editQuantity}
                  onChange={(event) => setEditQuantity(event.target.value)}
                  disabled={saving}
                />

                <small className="field-hint">
                  {Number(editWarehouseId) === editingProduct.warehouse_id
                    ? 'Nhập tổng số lượng tồn mới của mặt hàng trong kho hiện tại.'
                    : `Nhập số lượng muốn chuyển. Tối đa ${quantityFormat(
                        editingProduct.quantity,
                      )} đơn vị.`}
                </small>
              </label>

              <label className="form-field">
                <span className="field-label">Kho chứa *</span>

                <select
                  required
                  value={editWarehouseId}
                  onChange={(event) =>
                    setEditWarehouseId(
                      event.target.value ? Number(event.target.value) : '',
                    )
                  }
                  disabled={saving}
                >
                  <option value="">-- Chọn kho --</option>

                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                      {warehouse.id === editingProduct.warehouse_id
                        ? ' (Kho hiện tại)'
                        : ''}
                    </option>
                  ))}
                </select>
              </label>

              {Number(editWarehouseId) !== editingProduct.warehouse_id && (
                <div className="alert" role="note">
                  Khi lưu, số lượng nhập ở trên sẽ được chuyển từ kho hiện tại sang
                  kho đích. Nếu kho đích đã có mã hàng này, số lượng sẽ được cộng
                  thêm vào tồn kho đích.
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={closeEditProduct}
                  disabled={saving}
                >
                  Hủy
                </button>

                <button type="submit" className="button" disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function Metric({
  icon,
  title,
  value,
  detail,
}: {
  icon: string
  title: string
  value: string | number
  detail: string
}) {
  return (
    <div className="metric-card card">
      <div className="metric-card-top">
        <span className="metric-icon">{icon}</span>
        <span className="metric-title">{title}</span>
      </div>

      <strong className="metric-value">{value}</strong>
      <span className="metric-detail">{detail}</span>
    </div>
  )
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">▤</div>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  )
}

function HistoryBadge({ action }: { action: string }) {
  const normalized = action.toUpperCase()

  if (normalized === 'IN') {
    return <span className="history-badge history-in">Nhập hàng</span>
  }

  if (normalized === 'OUT') {
    return <span className="history-badge history-out">Xuất hàng</span>
  }

  if (normalized === 'DELETE') {
    return <span className="history-badge history-delete">Xóa hàng</span>
  }

  if (normalized === 'EDIT') {
    return <span className="history-badge history-edit">Chỉnh sửa</span>
  }

  return <span className="history-badge">{action}</span>
}
