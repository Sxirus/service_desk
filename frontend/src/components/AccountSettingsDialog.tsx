"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Camera, Key, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { actions } from "astro:actions"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ImageCropper } from "@/components/ui/image-cropper"
import { clearAvatarCache } from "@/utils/avatarManager"

interface AccountSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: {
    name: string
    email: string
    avatar: string
    initials: string
  }
  employeeId: number
  clientId: number
}

export function AccountSettingsDialog({
  open,
  onOpenChange,
  user,
  employeeId,
  clientId,
}: AccountSettingsDialogProps) {
  const { t } = useTranslation('auth')
  const [name, setName] = React.useState(user.name)
  const [avatarUrl, setAvatarUrl] = React.useState(user.avatar || "")
  const [avatarPreview, setAvatarPreview] = React.useState(user.avatar || "")
  const [pendingAvatarBlob, setPendingAvatarBlob] = React.useState<Blob | null>(null)
  const [showCropper, setShowCropper] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isSendingReset, setIsSendingReset] = React.useState(false)

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setName(user.name)
      setAvatarUrl(user.avatar || "")
      setAvatarPreview(user.avatar || "")
      setPendingAvatarBlob(null)
      setShowCropper(false)
    }
  }, [open, user])

  const handleCropComplete = (croppedBlob: Blob) => {
    // Create preview URL
    const previewUrl = URL.createObjectURL(croppedBlob)
    setAvatarPreview(previewUrl)
    setPendingAvatarBlob(croppedBlob)
    setShowCropper(false)
  }

  // Helper to convert blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Convert pending avatar to base64 if exists
      let avatarBase64: string | null = null
      if (pendingAvatarBlob) {
        avatarBase64 = await blobToBase64(pendingAvatarBlob)
        console.log("Avatar converted to base64, size:", avatarBase64.length)
      }

      // Update profile via server action (avatar upload happens server-side)
      const result = await actions.updateMyProfile({
        name: name.trim(),
        avatarBase64: avatarBase64,
      })

      if (!result?.data?.success) {
        toast.error(result?.data?.message || t('errors.requiredField'))
        setIsSaving(false)
        return
      }

      toast.success(t('accountSettings.saved'))
      setPendingAvatarBlob(null)
      
      // Clear avatar cache to ensure fresh signed URL on reload
      clearAvatarCache()
      
      onOpenChange(false)
      
      // Reload page to reflect changes in sidebar
      window.location.reload()
    } catch (err: any) {
      console.error("Save profile error:", err)
      toast.error(t('accountSettings.unexpectedError'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleSendPasswordReset = async () => {
    setIsSendingReset(true)
    try {
      const result = await actions.sendPasswordResetEmail({})

      if (!result?.data?.success) {
        toast.error(result?.data?.message || t('accountSettings.passwordResetFailed'))
        return
      }

      toast.success(t('accountSettings.passwordResetSent'))
    } catch (err: any) {
      console.error("Password reset error:", err)
      toast.error(t('accountSettings.unexpectedError'))
    } finally {
      setIsSendingReset(false)
    }
  }

  const hasChanges = name.trim() !== user.name || pendingAvatarBlob !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('accountSettings.title')}</DialogTitle>
          <DialogDescription>
            {t('accountSettings.personalInfo')}
          </DialogDescription>
        </DialogHeader>

        {showCropper ? (
          <ImageCropper
            onCropComplete={handleCropComplete}
            onCancel={() => setShowCropper(false)}
          />
        ) : (
          <div className="space-y-6">
            {/* Avatar Section */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={avatarPreview} alt={user.name} />
                  <AvatarFallback className="text-2xl">{user.initials}</AvatarFallback>
                </Avatar>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full shadow-md"
                  onClick={() => setShowCropper(true)}
                >
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('accountSettings.uploadAvatar')}
              </p>
            </div>

            {/* Name Input */}
            <div className="space-y-2">
              <Label htmlFor="name">{t('accountSettings.firstName')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('accountSettings.firstName')}
              />
            </div>

            {/* Email (Read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email">{t('accountSettings.email')}</Label>
              <Input
                id="email"
                value={user.email}
                disabled
                className="bg-muted"
              />
            </div>

            {/* Password Section */}
            <div className="space-y-2">
              <Label>{t('accountSettings.changePassword')}</Label>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={handleSendPasswordReset}
                disabled={isSendingReset}
              >
                {isSendingReset ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Key className="mr-2 h-4 w-4" />
                )}
                {t('accountSettings.changePassword')}
              </Button>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                {t('common:cancel', { ns: 'common' })}
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t('accountSettings.saveChanges')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
