# A PIN check named its member by a bcrypt per member with a PIN: 2.9 s for twelve staff at cost 12, about 10 s at
# forty (review of 6 Nov 2026, R3). pin_lookup is an HMAC of the business and the PIN under a server key, so one
# indexed query finds the holder. Not unique: two people may share a PIN. Existing PINs cannot be hashed here (the
# PIN itself is unknown); each member gets a lookup the first time their PIN matches by the bcrypt fallback.
class AddPinLookupToMemberships < ActiveRecord::Migration[8.1]
  def change
    add_column :memberships, :pin_lookup, :string
    add_index :memberships, %i[business_id pin_lookup], where: "pin_lookup IS NOT NULL", name: "index_memberships_on_business_id_and_pin_lookup"
  end
end
