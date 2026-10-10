FactoryBot.define do
  factory :user do
    name { Faker::Name.name }
    sequence(:email) { |n| "user#{n}-#{SecureRandom.hex(3)}@example.com" }
    password { "password123" }
  end

  factory :super_admin do
    name { "Servio Admin" }
    sequence(:email) { |n| "admin#{n}@servio.com" }
    password { "supersecret1" }
  end
end
