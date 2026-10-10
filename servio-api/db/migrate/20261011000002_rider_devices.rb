# SPEC Rider app: a rider's phone pairs as a device of kind "rider" and signs in with the rider's PIN.
class RiderDevices < ActiveRecord::Migration[8.0]
  def up
    remove_check_constraint :devices, name: "devices_kind_check"
    add_check_constraint :devices, "kind IN ('till','tablet','kitchen','customer_display','token_screen','kiosk','rider')", name: "devices_kind_check"
  end

  def down
    remove_check_constraint :devices, name: "devices_kind_check"
    add_check_constraint :devices, "kind IN ('till','tablet','kitchen','customer_display','token_screen','kiosk')", name: "devices_kind_check"
  end
end
