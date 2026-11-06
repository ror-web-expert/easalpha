module ApplicationCable
  class Channel < ActionCable::Channel::Base
    # Access is asked again every minute: a till removed in Admin, a member deactivated or moved off the branch stops
    # hearing a stream it opened before (final round, sync-auth#9).
    periodically :recheck_access, every: 1.minute

    # Whether a principal (Connection.resolve) may hear this channel at all; each channel names who. Nobody by default.
    def self.allowed?(_principal) = false

    # A session (rather than a device token alone) holding any of these permissions.
    def self.member_with?(principal, codes) = principal[:membership_id].present? && Array(principal[:permissions]).intersect?(codes)

    # Signed in in the admin (no device) or on a device of one of these kinds.
    def self.on_device?(principal, kinds) = principal[:device_kind].nil? || principal[:device_kind].in?(kinds)

    private

    # Streams name:business:branch for the branch asked for (or the token's own) when the subscriber, looked up again
    # now, may hear this channel and the device sits at that branch or the member may work at it; otherwise the
    # subscription is rejected (review of 6 Nov 2026, A9).
    def listen(name)
      current = fresh_principal
      branch = current && self.class.allowed?(current) ? branch_for(current) : nil
      return reject unless branch
      @listening = branch
      stream_from "#{name}:#{current[:business_id]}:#{branch}"
    end

    def branch_for(principal)
      wanted = (params[:branch_id].presence || principal[:branch_id]).to_s
      allowed = principal[:branch_ids]
      wanted if wanted.present? && (allowed == "all" || Array(allowed).include?(wanted))
    end

    def fresh_principal = Connection.resolve(**principal.to_h.symbolize_keys.slice(:typ, :business_id, :device_id, :membership_id, :branch_id, :app))

    def recheck_access
      return unless @listening
      current = fresh_principal
      return if current && self.class.allowed?(current) && branch_for(current) == @listening
      @listening = nil
      stop_all_streams
      connection.close(reason: ActionCable::INTERNAL[:disconnect_reasons][:unauthorized], reconnect: false)
    end
  end
end
