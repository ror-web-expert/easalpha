# SPEC: documents are numbered per type (GRN-000023, TRF-000004), so the number is unique per business and kind.
class StockDocumentNumbersPerKind < ActiveRecord::Migration[8.0]
  def up
    remove_index :stock_documents, name: "index_stock_documents_on_business_id_and_number"
    add_index :stock_documents, [:business_id, :kind, :number], unique: true
  end

  def down
    remove_index :stock_documents, [:business_id, :kind, :number]
    add_index :stock_documents, [:business_id, :number], unique: true
  end
end
