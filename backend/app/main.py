from __future__ import annotations

import os
from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from zoneinfo import ZoneInfo
from sqlalchemy import (
    create_engine,
    String,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    Numeric,
    Text,
    UniqueConstraint,
    select,
    func,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    Session,
    sessionmaker,
    relationship,
)


# =========================================================
# DATABASE
# =========================================================

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./inventory.db",
)

engine_options = {"pool_pre_ping": True}

if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {
        "check_same_thread": False
    }

engine = create_engine(DATABASE_URL, **engine_options)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


# =========================================================
# DATABASE MODELS
# =========================================================

class Warehouse(Base):
    __tablename__ = "warehouses"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    name: Mapped[str] = mapped_column(
        String(200),
        unique=True,
        index=True,
        nullable=False,
    )


    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    items: Mapped[list["Product"]] = relationship(
        back_populates="warehouse",
    )


class Product(Base):
    """
    Một mã hàng chỉ có một bản ghi.

    Các thuộc tính nghiệp vụ:
    - sku
    - quantity
    - warehouse_id

    id là khóa chính nội bộ.
    """

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    sku: Mapped[str] = mapped_column(
        String(80),
        unique=True,
        index=True,
        nullable=False,
    )

    quantity: Mapped[Decimal] = mapped_column(
        Numeric(14, 3),
        default=Decimal("0"),
        nullable=False,
    )

    warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    warehouse: Mapped[Warehouse] = relationship(
        back_populates="items",
    )


class InventoryHistory(Base):
    """
    Lưu lịch sử độc lập với mặt hàng và kho.
    Nhờ vậy lịch sử vẫn giữ được tên kho và mã hàng
    kể cả khi dữ liệu hiện tại thay đổi.
    """

    __tablename__ = "inventory_history"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    action: Mapped[str] = mapped_column(
        String(20),
        index=True,
        nullable=False,
    )

    sku: Mapped[str] = mapped_column(
        String(80),
        index=True,
        nullable=False,
    )

    warehouse_name: Mapped[str] = mapped_column(
        String(200),
        index=True,
        nullable=False,
    )

    quantity: Mapped[Decimal] = mapped_column(
        Numeric(14, 3),
        nullable=False,
    )

    note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")),
        index=True,
    )


class StockCartItem(Base):
    """Dòng hàng đang được giữ tạm trong giỏ xuất kho."""

    __tablename__ = "stock_cart_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    sku: Mapped[str] = mapped_column(String(80), nullable=False)
    warehouse_id: Mapped[int] = mapped_column(Integer, nullable=False)
    warehouse_name: Mapped[str] = mapped_column(String(200), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
    )


class ShopCartItem(Base):
    __tablename__ = "shop_cart_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")))


class ShopCustomer(Base):
    __tablename__ = "shop_customers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    debt_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")), index=True)


class ShopHistory(Base):
    __tablename__ = "shop_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    action: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    item_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False, default=Decimal("0"))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")), index=True)


class ShopCartAdd(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit_price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)


class ShopCartConfirm(BaseModel):
    customer_name: str = Field(min_length=1, max_length=200)
    is_debt: bool = False


class ShopDebtPayment(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)


class StockCartAdd(BaseModel):
    sku: str = Field(min_length=1, max_length=80)
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    warehouse_id: int


class StockCartConfirm(BaseModel):
    recipient_name: str = Field(min_length=1, max_length=200)


# Chỉ tạo bảng còn thiếu.
# Lưu ý: create_all không tự chuyển đổi bảng cũ.
Base.metadata.create_all(bind=engine)


# =========================================================
# FASTAPI
# =========================================================

app = FastAPI(
    title="Inventory Manager",
    version="2.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =========================================================
# REQUEST SCHEMAS
# =========================================================

class WarehouseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class WarehouseUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class StockAction(BaseModel):
    sku: str = Field(min_length=1, max_length=80)
    quantity: Decimal = Field(
        gt=0,
        max_digits=14,
        decimal_places=3,
    )
    warehouse_id: int

class WarehouseItemUpdate(BaseModel):
    quantity: Decimal = Field(
        ge=0,
        max_digits=14,
        decimal_places=3,
    )
    target_warehouse_id: int



# =========================================================
# HELPERS
# =========================================================

def clean_sku(sku: str) -> str:
    value = sku.strip()

    if not value:
        raise HTTPException(
            status_code=400,
            detail="Mã hàng không được để trống",
        )

    return value


def quantity_text(value) -> str:
    number = Decimal(str(value if value is not None else 0))
    result = format(number, "f")

    if "." in result:
        result = result.rstrip("0").rstrip(".")

    return result or "0"


def add_history(
    db: Session,
    action: str,
    sku: str,
    warehouse_name: str,
    quantity: Decimal,
    note: str | None = None,
):
    db.add(
        InventoryHistory(
            action=action,
            sku=sku,
            warehouse_name=warehouse_name,
            quantity=quantity,
            note=note,
        )
    )


def get_product_by_sku(
    db: Session,
    sku: str,
) -> Product | None:
    return db.scalar(
        select(Product).where(Product.sku == sku)
    )


def product_response(product: Product) -> dict:
    return {
        "id": product.id,
        "sku": product.sku,
        "quantity": quantity_text(product.quantity),
        "warehouse_id": product.warehouse_id,
        "warehouse_name": product.warehouse.name,
    }


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
def health():
    return {"status": "ok"}


# =========================================================
# DASHBOARD
# =========================================================

@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    warehouses = db.scalars(
        select(Warehouse).order_by(Warehouse.name)
    ).all()

    total_quantity = Decimal("0")
    all_skus = set()
    warehouse_rows = []

    for warehouse in warehouses:
        products = db.scalars(
            select(Product)
            .where(Product.warehouse_id == warehouse.id)
            .order_by(Product.sku)
        ).all()

        warehouse_total = sum(
            (Decimal(item.quantity) for item in products),
            Decimal("0"),
        )

        total_quantity += warehouse_total
        all_skus.update(item.sku for item in products)

        warehouse_rows.append({
            "id": warehouse.id,
            "name": warehouse.name,
            "item_count": len(products),
            "total_quantity": quantity_text(warehouse_total),
        })

    return {
        "total_quantity": quantity_text(total_quantity),
        "total_skus": len(all_skus),
        "warehouse_count": len(warehouses),
        "warehouses": warehouse_rows,
    }


# =========================================================
# WAREHOUSE CRUD
# =========================================================

@app.get("/api/warehouses")
def list_warehouses(db: Session = Depends(get_db)):
    warehouses = db.scalars(
        select(Warehouse).order_by(Warehouse.name)
    ).all()

    result = []

    for warehouse in warehouses:
        products = db.scalars(
            select(Product).where(
                Product.warehouse_id == warehouse.id
            )
        ).all()

        total = sum(
            (Decimal(item.quantity) for item in products),
            Decimal("0"),
        )

        result.append({
            "id": warehouse.id,
            "name": warehouse.name,
            "item_count": len(products),
            "total_quantity": quantity_text(total),
        })

    return result


@app.post("/api/warehouses", status_code=201)
def create_warehouse(
    payload: WarehouseCreate,
    db: Session = Depends(get_db),
):
    name = payload.name.strip()

    if not name:
        raise HTTPException(400, "Tên kho không được để trống")

    existing = db.scalar(
        select(Warehouse).where(Warehouse.name == name)
    )

    if existing:
        raise HTTPException(409, "Tên kho đã tồn tại")

    warehouse = Warehouse(
        name=payload.name,
    )

    db.add(warehouse)
    db.commit()
    db.refresh(warehouse)

    return {
        "id": warehouse.id,
        "name": warehouse.name,
        "item_count": 0,
        "total_quantity": "0",
    }


@app.put("/api/warehouses/{warehouse_id}")
def update_warehouse(
    warehouse_id: int,
    payload: WarehouseUpdate,
    db: Session = Depends(get_db),
):
    warehouse = db.get(Warehouse, warehouse_id)

    if not warehouse:
        raise HTTPException(404, "Không tìm thấy kho")

    name = payload.name.strip()

    if not name:
        raise HTTPException(400, "Tên kho không được để trống")

    duplicate = db.scalar(
        select(Warehouse).where(
            Warehouse.name == name,
            Warehouse.id != warehouse_id,
        )
    )

    if duplicate:
        raise HTTPException(409, "Tên kho đã tồn tại")

    warehouse.name = name

    db.commit()

    return {"message": "Đã cập nhật kho"}


@app.delete("/api/warehouses/{warehouse_id}")
def delete_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    warehouse = db.get(Warehouse, warehouse_id)

    if not warehouse:
        raise HTTPException(404, "Không tìm thấy kho")

    product_count = db.scalar(
        select(func.count(Product.id)).where(
            Product.warehouse_id == warehouse_id
        )
    ) or 0

    # Không xóa kho khi vẫn còn hàng.
    # Tránh vô tình làm mất tồn kho.
    if product_count > 0:
        raise HTTPException(
            409,
            "Kho vẫn còn mặt hàng. Hãy chuyển hàng sang kho khác trước khi xóa.",
        )

    db.delete(warehouse)
    db.commit()

    return {"message": "Đã xóa kho"}


# =========================================================
# ITEMS IN A WAREHOUSE
# =========================================================

@app.get("/api/warehouses/{warehouse_id}/items")
def list_warehouse_items(
    warehouse_id: int,
    q: str = Query(default=""),
    db: Session = Depends(get_db),
):
    warehouse = db.get(Warehouse, warehouse_id)

    if not warehouse:
        raise HTTPException(404, "Không tìm thấy kho")

    stmt = (
        select(Product)
        .where(Product.warehouse_id == warehouse_id, Product.quantity > 0)
        .order_by(Product.sku)
    )

    if q.strip():
        stmt = stmt.where(
            Product.sku.ilike(f"%{q.strip()}%")
        )

    products = db.scalars(stmt).all()

    return [
        {
            "id": product.id,
            "product_id": product.id,
            "sku": product.sku,
            "quantity": quantity_text(product.quantity),
            "warehouse_id": product.warehouse_id,
            "warehouse_name": warehouse.name,
        }
        for product in products
    ]


@app.delete(
    "/api/warehouses/{warehouse_id}/items/{product_id}"
)
def delete_warehouse_item(
    warehouse_id: int,
    product_id: int,
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)

    if not product or product.warehouse_id != warehouse_id:
        raise HTTPException(
            404,
            "Mặt hàng không tồn tại trong kho",
        )

    pending = db.scalar(
        select(func.count(StockCartItem.id)).where(StockCartItem.product_id == product_id)
    ) or 0
    if pending:
        raise HTTPException(409, "Mặt hàng đang nằm trong giỏ xuất. Hãy bỏ khỏi giỏ trước khi xóa.")

    warehouse = db.get(Warehouse, warehouse_id)

    add_history(
        db,
        "DELETE",
        product.sku,
        warehouse.name,
        Decimal(product.quantity),
        "Xóa mặt hàng khỏi danh sách tồn kho",
    )

    db.delete(product)
    db.commit()

    return {"message": "Đã xóa mặt hàng khỏi kho"}


# =========================================================
# STOCK IN
# =========================================================

@app.post("/api/stock/in", status_code=201)
def stock_in(
    payload: StockAction,
    db: Session = Depends(get_db),
):
    sku = clean_sku(payload.sku)

    warehouse = db.get(Warehouse, payload.warehouse_id)

    if not warehouse:
        raise HTTPException(404, "Vui lòng chọn kho hợp lệ")

    product = get_product_by_sku(db, sku)

    try:
        if product is None:
            # Mã hàng mới: tạo đúng một bản ghi
            # và gắn mã hàng vào kho được chọn.
            product = Product(
                sku=sku,
                quantity=payload.quantity,
                warehouse_id=warehouse.id,
            )
            db.add(product)

        else:
            # Mã hàng đã thuộc kho khác:
            # không tự tạo thêm bản ghi trùng mã.
            if product.warehouse_id != warehouse.id:
                current_warehouse = db.get(
                    Warehouse,
                    product.warehouse_id,
                )

                current_name = (
                    current_warehouse.name
                    if current_warehouse
                    else "không xác định"
                )

                raise HTTPException(
                    409,
                    f"Mã hàng {sku} đang thuộc kho "
                    f"'{current_name}'. Hãy chuyển kho trước khi nhập.",
                )

            product.quantity = (
                Decimal(product.quantity) + payload.quantity
            )

        add_history(
            db,
            "IN",
            sku,
            warehouse.name,
            payload.quantity,
            "Nhập hàng",
        )

        db.commit()

    except Exception:
        db.rollback()
        raise

    return {
        "message": "Nhập hàng thành công",
        "sku": sku,
        "quantity": quantity_text(product.quantity),
        "warehouse_id": warehouse.id,
        "warehouse_name": warehouse.name,
    }


# =========================================================
# STOCK OUT
# =========================================================

@app.get("/api/cart")
def get_stock_cart(db: Session = Depends(get_db)):
    rows = db.scalars(select(StockCartItem).order_by(StockCartItem.created_at, StockCartItem.id)).all()
    return [
        {
            "id": row.id, "product_id": row.product_id, "sku": row.sku,
            "warehouse_id": row.warehouse_id, "warehouse_name": row.warehouse_name,
            "quantity": quantity_text(row.quantity),
        }
        for row in rows
    ]


@app.post("/api/cart/items", status_code=201)
def add_stock_cart_item(payload: StockCartAdd, db: Session = Depends(get_db)):
    sku = clean_sku(payload.sku)
    product = db.scalar(select(Product).where(Product.sku == sku).with_for_update())
    if not product:
        raise HTTPException(404, "Mã hàng không tồn tại")
    if product.warehouse_id != payload.warehouse_id:
        raise HTTPException(409, "Mã hàng không thuộc kho đã chọn")
    warehouse = db.get(Warehouse, product.warehouse_id)
    if not warehouse:
        raise HTTPException(404, "Không tìm thấy kho")
    current = Decimal(str(product.quantity))
    if current < payload.quantity:
        raise HTTPException(400, f"Số lượng xuất vượt tồn kho. Hiện có {quantity_text(current)}")
    try:
        product.quantity = current - payload.quantity
        existing = db.scalar(select(StockCartItem).where(
            StockCartItem.product_id == product.id, StockCartItem.warehouse_id == warehouse.id
        ).with_for_update())
        if existing:
            existing.quantity = Decimal(str(existing.quantity)) + payload.quantity
        else:
            db.add(StockCartItem(
                product_id=product.id, sku=product.sku, warehouse_id=warehouse.id,
                warehouse_name=warehouse.name, quantity=payload.quantity,
            ))
        db.commit()
        return {"message": "Đã thêm hàng vào giỏ xuất", "available_quantity": quantity_text(product.quantity)}
    except Exception:
        db.rollback()
        raise


@app.delete("/api/cart/items/{cart_item_id}")
def remove_stock_cart_item(cart_item_id: int, db: Session = Depends(get_db)):
    row = db.scalar(select(StockCartItem).where(StockCartItem.id == cart_item_id).with_for_update())
    if not row:
        raise HTTPException(404, "Không tìm thấy dòng hàng trong giỏ")
    try:
        product = db.scalar(select(Product).where(Product.id == row.product_id).with_for_update())
        if not product:
            raise HTTPException(409, "Không thể hoàn kho vì mặt hàng gốc không còn tồn tại")
        if product.warehouse_id != row.warehouse_id:
            raise HTTPException(409, "Kho của mặt hàng đã thay đổi; không thể tự động hoàn kho")
        product.quantity = Decimal(str(product.quantity)) + Decimal(str(row.quantity))
        db.delete(row)
        db.commit()
        return {"message": "Đã bỏ hàng khỏi giỏ và hoàn số lượng về kho"}
    except Exception:
        db.rollback()
        raise


@app.post("/api/cart/confirm")
def confirm_stock_cart(payload: StockCartConfirm, db: Session = Depends(get_db)):
    recipient = payload.recipient_name.strip()
    if not recipient:
        raise HTTPException(400, "Vui lòng nhập tên người nhận")
    rows = db.scalars(select(StockCartItem).order_by(StockCartItem.id).with_for_update()).all()
    if not rows:
        raise HTTPException(400, "Giỏ hàng đang trống")
    try:
        for row in rows:
            product = db.scalar(select(Product).where(Product.id == row.product_id).with_for_update())
            if not product or product.warehouse_id != row.warehouse_id:
                raise HTTPException(409, f"Mặt hàng {row.sku} đã thay đổi; không thể xác nhận xuất")
            add_history(db, "OUT", row.sku, row.warehouse_name, Decimal(str(row.quantity)), f"Người nhận: {recipient}")
            if Decimal(str(product.quantity)) == 0:
                db.delete(product)
            db.delete(row)
        db.commit()
        return {"message": f"Đã xác nhận xuất {len(rows)} dòng hàng cho {recipient}", "items": len(rows)}
    except Exception:
        db.rollback()
        raise


# Giữ endpoint cũ để tương thích, nhưng chuyển hành vi sang giỏ xuất.
@app.post("/api/stock/out")
def stock_out(payload: StockAction, db: Session = Depends(get_db)):
    return add_stock_cart_item(
        StockCartAdd(sku=payload.sku, quantity=payload.quantity, warehouse_id=payload.warehouse_id),
        db,
    )


# =========================================================
# EDIT PRODUCT IN A WAREHOUSE
# =========================================================


@app.put("/api/warehouses/{warehouse_id}/items/{product_id}")
def update_warehouse_item(
    warehouse_id: int,
    product_id: int,
    payload: WarehouseItemUpdate,
    db: Session = Depends(get_db),
):
    source_warehouse = db.get(Warehouse, warehouse_id)
    if not source_warehouse:
        raise HTTPException(404, "Không tìm thấy kho hiện tại")

    product = db.get(Product, product_id)

    if not product or product.warehouse_id != warehouse_id:
        raise HTTPException(
            404,
            "Không tìm thấy mặt hàng",
        )

    pending = db.scalar(
        select(func.count(StockCartItem.id)).where(StockCartItem.product_id == product_id)
    ) or 0
    if pending:
        raise HTTPException(409, "Mặt hàng đang nằm trong giỏ xuất. Hãy bỏ khỏi giỏ trước khi sửa số lượng hoặc chuyển kho.")

    target_warehouse = db.get(
        Warehouse,
        payload.target_warehouse_id,
    )

    if not target_warehouse:
        raise HTTPException(404, "Không tìm thấy kho được chọn")

    old_quantity = Decimal(str(product.quantity))
    new_quantity = Decimal(str(payload.quantity))
    old_warehouse_name = source_warehouse.name
    new_warehouse_name = target_warehouse.name

    try:
        # Cập nhật số lượng đúng bằng giá trị nhập trong form.
        # Ví dụ: 100 -> 20 thì tồn kho mới là 20.
        product.quantity = new_quantity

        # Cập nhật kho đúng bằng kho được chọn trong form.
        product.warehouse_id = target_warehouse.id

        # Ghi lịch sử chỉnh sửa số lượng.
        if old_quantity != new_quantity and source_warehouse.id != target_warehouse.id:
            add_history(
                db,
                "EDIT",
                product.sku,
                new_warehouse_name,
                new_quantity,
                (
                    f"Sửa số lượng: "
                    f"{quantity_text(old_quantity)} -> "
                    f"{quantity_text(new_quantity)}"
                    f" (Kho: {old_warehouse_name} "
                    f"-> {new_warehouse_name})"
                ),
            )
        else:
            if old_quantity != new_quantity:
                add_history(
                    db,
                    "EDIT",
                    product.sku,
                    new_warehouse_name,
                    new_quantity,
                    (
                        f"Sửa số lượng: "
                        f"{quantity_text(old_quantity)} -> "
                        f"{quantity_text(new_quantity)}"
                    ),
                )

            # Ghi lịch sử chỉnh sửa kho, không phải chuyển hàng.
            if source_warehouse.id != target_warehouse.id:
                add_history(
                    db,
                    "EDIT",
                    product.sku,
                    new_warehouse_name,
                    new_quantity,
                    (
                        f"Sửa kho: {old_warehouse_name} "
                        f"-> {new_warehouse_name}"
                    ),
                )

        # Nếu số lượng được sửa thành 0 thì xóa bản ghi mặt hàng.
        if new_quantity == 0:
            db.delete(product)

        db.commit()

        return {
            "message": "Đã cập nhật mặt hàng thành công",
            "sku": product.sku,
            "quantity": quantity_text(new_quantity),
            "warehouse_id": target_warehouse.id,
            "warehouse_name": target_warehouse.name,
        }

    except Exception:
        db.rollback()
        raise



# =========================================================
# STORE / SHOP DEBT
# =========================================================

def money_text(value) -> str:
    return format(Decimal(str(value or 0)), "f").rstrip("0").rstrip(".") if "." in format(Decimal(str(value or 0)), "f") else format(Decimal(str(value or 0)), "f")


@app.get("/api/shop/cart")
def get_shop_cart(db: Session = Depends(get_db)):
    rows = db.scalars(select(ShopCartItem).order_by(ShopCartItem.id)).all()
    return [{"id": r.id, "name": r.name, "quantity": quantity_text(r.quantity), "unit_price": money_text(r.unit_price), "total": money_text(Decimal(r.quantity) * Decimal(r.unit_price))} for r in rows]


@app.post("/api/shop/cart", status_code=201)
def add_shop_cart(payload: ShopCartAdd, db: Session = Depends(get_db)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Vui lòng nhập tên mặt hàng")
    row = ShopCartItem(name=name, quantity=payload.quantity, unit_price=payload.unit_price)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "message": "Đã thêm mặt hàng vào giỏ cửa hàng"}


@app.delete("/api/shop/cart/{item_id}")
def delete_shop_cart_item(item_id: int, db: Session = Depends(get_db)):
    row = db.get(ShopCartItem, item_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy mặt hàng trong giỏ")
    db.delete(row)
    db.commit()
    return {"message": "Đã xóa mặt hàng khỏi giỏ"}


@app.post("/api/shop/checkout")
def checkout_shop(payload: ShopCartConfirm, db: Session = Depends(get_db)):
    customer_name = payload.customer_name.strip()
    if not customer_name:
        raise HTTPException(400, "Vui lòng nhập tên khách hàng")
    rows = db.scalars(select(ShopCartItem).order_by(ShopCartItem.id).with_for_update()).all()
    if not rows:
        raise HTTPException(400, "Giỏ hàng cửa hàng đang trống")
    total = sum((Decimal(r.quantity) * Decimal(r.unit_price) for r in rows), Decimal("0"))
    try:
        if payload.is_debt:
            customer = db.scalar(select(ShopCustomer).where(ShopCustomer.name == customer_name).with_for_update())
            if customer is None:
                customer = ShopCustomer(name=customer_name, debt_amount=total)
                db.add(customer)
            else:
                customer.debt_amount = Decimal(customer.debt_amount) + total
            customer.updated_at = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
        for row in rows:
            line_total = Decimal(row.quantity) * Decimal(row.unit_price)
            db.add(ShopHistory(
                action="SALE_DEBT" if payload.is_debt else "SALE_PAID",
                customer_name=customer_name, item_name=row.name,
                quantity=row.quantity, unit_price=row.unit_price,
                amount=line_total,
                note="Ghi nợ" if payload.is_debt else "Đã thanh toán",
            ))
            db.delete(row)
        db.commit()
        return {"message": "Đã hoàn tất giao dịch cửa hàng", "total": money_text(total), "is_debt": payload.is_debt}
    except Exception:
        db.rollback()
        raise


@app.get("/api/shop/debts")
def list_shop_debts(q: str = Query(default=""), db: Session = Depends(get_db)):
    stmt = select(ShopCustomer).where(ShopCustomer.debt_amount > 0).order_by(ShopCustomer.updated_at.desc())
    if q.strip():
        stmt = stmt.where(ShopCustomer.name.ilike(f"%{q.strip()}%"))
    rows = db.scalars(stmt).all()
    return [{"id": r.id, "name": r.name, "debt_amount": money_text(r.debt_amount), "updated_at": r.updated_at.isoformat() if r.updated_at else None} for r in rows]


@app.post("/api/shop/debts/{customer_id}/payment")
def pay_shop_debt(customer_id: int, payload: ShopDebtPayment, db: Session = Depends(get_db)):
    customer = db.scalar(select(ShopCustomer).where(ShopCustomer.id == customer_id).with_for_update())
    if not customer:
        raise HTTPException(404, "Không tìm thấy khách nợ")
    current = Decimal(customer.debt_amount)
    if payload.amount > current:
        raise HTTPException(400, f"Số tiền trả không được vượt quá khoản nợ {money_text(current)} USD")
    remaining = current - payload.amount
    db.add(ShopHistory(action="DEBT_PAYMENT", customer_name=customer.name, item_name=None, quantity=Decimal("0"), unit_price=Decimal("0"), amount=payload.amount, note=f"Trả nợ; còn lại {money_text(remaining)} USD"))
    if remaining == 0:
        db.delete(customer)
    else:
        customer.debt_amount = remaining
        customer.updated_at = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
    db.commit()
    return {"message": "Đã cập nhật khoản nợ", "remaining": money_text(remaining)}


@app.get("/api/shop/history")
def list_shop_history(limit: int = Query(default=200, ge=1, le=500), db: Session = Depends(get_db)):
    rows = db.scalars(select(ShopHistory).order_by(ShopHistory.created_at.desc(), ShopHistory.id.desc()).limit(limit)).all()
    return [{"id": r.id, "action": r.action, "customer_name": r.customer_name, "item_name": r.item_name, "quantity": quantity_text(r.quantity), "unit_price": money_text(r.unit_price), "amount": money_text(r.amount), "note": r.note, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]


# =========================================================
# HISTORY
# =========================================================

@app.get("/api/history")
def list_history(
    action: Literal[
        "ALL",
        "IN",
        "OUT",
        "DELETE",
        "EDIT",
    ] = "ALL",
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    stmt = select(InventoryHistory).order_by(
        InventoryHistory.created_at.desc(),
        InventoryHistory.id.desc(),
    )

    if action != "ALL":
        stmt = stmt.where(
            InventoryHistory.action == action
        )

    rows = db.scalars(stmt.limit(limit)).all()

    return [
        {
            "id": row.id,
            "action": row.action,
            "sku": row.sku,
            "warehouse_name": row.warehouse_name,
            "quantity": quantity_text(row.quantity),
            "note": row.note,
            "created_at": (
                row.created_at.isoformat()
                if row.created_at
                else None
            ),
        }
        for row in rows
    ]
@app.delete("/api/history")
def delete_all_history(db: Session = Depends(get_db)):
    deleted_count = db.query(InventoryHistory).delete(
        synchronize_session=False
    )

    db.commit()

    return {
        "message": "Đã xóa toàn bộ lịch sử.",
        "deleted_count": deleted_count,
    }