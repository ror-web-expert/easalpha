module Api
  module V1
    # Product, category and deal images (SPEC: PNG, JPG or WEBP, max 5 MB). Stored with Active Storage; the returned key
    # is the public path the web app puts straight into an <img>.
    class UploadsController < BaseController
      TYPES = %w[image/png image/jpeg image/webp].freeze
      MAX_BYTES = 5.megabytes

      # POST /uploads  multipart file
      def create
        require_permission!("menu.edit", "settings.manage")
        read_only_guard!
        file = params.require(:file)
        raise Api::Errors::BadRequest.new("upload.type", "Only PNG, JPG or WEBP images are allowed") unless TYPES.include?(file.content_type)
        raise Api::Errors::BadRequest.new("upload.size", "The image must be 5 MB or smaller") if file.size > MAX_BYTES
        blob = ActiveStorage::Blob.create_and_upload!(io: file.tempfile, filename: file.original_filename, content_type: file.content_type,
                                                       metadata: { business_id: current_business.id })
        key = "#{request.base_url}/api/v1/uploads/#{blob.signed_id}"
        audit!("create", table_name: "uploads", record_id: blob.id, after: { filename: blob.filename.to_s, bytes: blob.byte_size })
        render json: { key: key, filename: blob.filename.to_s, content_type: blob.content_type, bytes: blob.byte_size }, status: :created
      end

      # GET /uploads/:id  public; the signed id is unguessable
      def show
        blob = ActiveStorage::Blob.find_signed(params[:id])
        raise Api::Errors::NotFound.new("upload.missing", "Image not found") unless blob
        expires_in 1.year, public: true
        send_data blob.download, type: blob.content_type, disposition: "inline", filename: blob.filename.to_s
      end
    end
  end
end
