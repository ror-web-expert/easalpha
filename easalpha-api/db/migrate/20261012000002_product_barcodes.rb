# Barcodes and QR codes on products and their variants, several per product (a single packet and a carton of six can
# share one product with a pack quantity). Scanned on the POS. Asked for on 12 Oct 2026 for tuck shops and canteens.
class ProductBarcodes < ActiveRecord::Migration[8.0]
  def up
    create_table :product_barcodes, id: :uuid do |t|
      t.references :business, type: :uuid, null: false, foreign_key: true
      t.references :product, type: :uuid, null: false, foreign_key: true
      t.uuid :variant_id
      t.string :code, null: false
      t.decimal :quantity, precision: 12, scale: 3, null: false, default: 1
      t.timestamps
    end
    add_index :product_barcodes, %i[business_id code], unique: true
    add_foreign_key :product_barcodes, :product_variants, column: :variant_id, on_delete: :cascade
    add_check_constraint :product_barcodes, "quantity > 0", name: "product_barcodes_quantity_check"
    EasAlpha::Rls.apply!(%w[product_barcodes])
  end

  def down
    drop_table :product_barcodes
  end
end
