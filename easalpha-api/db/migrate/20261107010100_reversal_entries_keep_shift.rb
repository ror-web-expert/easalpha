# A reversal written before 6 Nov 2026 (a voided expense, say) carries no shift, so a shift open across that deploy
# counts the expense but not its void and its drawer comes out short (review deploy#7). Each such reversal takes the
# shift of the entry it reverses, on the same account; no balance changes, only the shift the row belongs to.
class ReversalEntriesKeepShift < ActiveRecord::Migration[8.0]
  def up
    execute <<~SQL
      UPDATE account_entries rev SET shift_id = orig.shift_id
      FROM account_entries orig
      WHERE orig.reversed_by_entry_id = rev.id AND orig.payment_account_id = rev.payment_account_id
        AND rev.shift_id IS NULL AND orig.shift_id IS NOT NULL
    SQL
  end

  def down; end
end
