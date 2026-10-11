# Cursor pagination on (created_at, id) descending. ?cursor=...&limit=50, max 200.
class Paginator
  DEFAULT = 50
  MAX = 200

  def self.call(scope, cursor:, limit:, order_column: :created_at)
    limit = limit.to_i
    limit = DEFAULT if limit <= 0
    limit = [ limit, MAX ].min
    conn = scope.connection
    table = conn.quote_table_name(scope.table_name)
    column = conn.quote_column_name(order_column)
    scope = scope.reorder(Arel.sql("#{table}.#{column} DESC, #{table}.id DESC"))
    if cursor.present?
      ts, id = Base64.urlsafe_decode64(cursor).split("|", 2)
      scope = scope.where("(#{table}.#{column}, #{table}.id) < (?, ?)", Time.iso8601(ts), id)
    end
    rows = scope.limit(limit + 1).to_a
    more = rows.size > limit
    rows = rows.first(limit)
    next_cursor = more && rows.last ? Base64.urlsafe_encode64("#{rows.last.public_send(order_column).iso8601(6)}|#{rows.last.id}") : nil
    [ rows, next_cursor ]
  rescue ArgumentError
    raise Api::Errors::BadRequest.new("invalid_cursor", "Cursor is not valid")
  end
end
