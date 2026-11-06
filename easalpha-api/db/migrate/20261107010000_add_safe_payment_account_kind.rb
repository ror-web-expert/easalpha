# A branch's safe becomes a payment account, mirrored under 1050 Cash in Safe: drops go into it, a float comes out of
# it and goes back at the count, and banking it is a transfer to a bank account (QA B3 and B7, review ledger#7).
class AddSafePaymentAccountKind < ActiveRecord::Migration[8.0]
  def up
    remove_check_constraint :payment_accounts, name: "payment_accounts_kind_check"
    add_check_constraint :payment_accounts, "kind in ('cash','wallet','bank','drawer','custom','safe')", name: "payment_accounts_kind_check"
  end

  def down
    remove_check_constraint :payment_accounts, name: "payment_accounts_kind_check"
    add_check_constraint :payment_accounts, "kind in ('cash','wallet','bank','drawer','custom')", name: "payment_accounts_kind_check"
  end
end
