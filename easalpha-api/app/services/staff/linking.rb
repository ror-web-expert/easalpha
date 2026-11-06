module Staff
  # Which existing login an owner adding staff by phone or email may link (QA of 6 Nov 2026, P1). The owner means the
  # person who holds that phone or email, and a login counts as that person only when it proved the phone or email, or
  # has no other way in (a login an owner made with just a phone belongs to whoever holds the phone). Anything else
  # waits for the person to prove it: an invitation. So does a phone and an email that belong to two different logins.
  module Linking
    Result = Struct.new(:user, :invite, keyword_init: true)
    module_function

    # user: the login to link; nil with invite false: nobody has either, so a new login is made; invite: true otherwise.
    def resolve(phone:, email:)
      found = { phone: phone && User.find_by(phone: phone), email: email && User.find_by(email: email) }.compact
      return Result.new(user: nil, invite: false) if found.empty?
      return Result.new(user: nil, invite: true) if found.values.uniq.size > 1
      user = found.values.first
      linkable = found.keys.any? { |kind| user.verified?(kind) || !user.other_way_in_than?(kind) }
      Result.new(user: linkable ? user : nil, invite: !linkable)
    end

    # The login the phone or email belongs to, linkable or not, for the "already a member" check.
    def any_holder(phone:, email:) = (phone && User.find_by(phone: phone)) || (email && User.find_by(email: email))
  end
end
