"use client"

import React, { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Building2, Save, AlertCircle, Check } from "lucide-react"

// shadcn/ui components (du musst diese importieren entsprechend deiner Setup)
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"

const formSchema = z.object({
  name: z.string().min(2, {
    message: "Company name must be at least 2 characters.",
  }),
  address: z.string(),
  city: z.string(),
  postalCode: z.string(),
  country: z.string(),
  taxNumber: z.string(),
  vatNumber: z.string(),
  phone: z.string(),
  email: z.string(),
  website: z.string(),
})

type FormData = z.infer<typeof formSchema>

interface CompanyManagementFormProps {
  initialData: {
    id: number
    name: string
    address: string
    city: string
    postalCode: string
    country: string
    taxNumber: string
    vatNumber: string
    phone: string
    email: string
    website: string
  }
}

export default function CompanyManagementForm({ initialData }: CompanyManagementFormProps) {
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData.name,
      address: initialData.address,
      city: initialData.city,
      postalCode: initialData.postalCode,
      country: initialData.country,
      taxNumber: initialData.taxNumber,
      vatNumber: initialData.vatNumber,
      phone: initialData.phone,
      email: initialData.email,
      website: initialData.website,
    },
  })

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    
    try {
      // Astro Action direkt aufrufen
      const { actions } = await import("astro:actions")
      
      const result = await actions.updateCompany({
        id: initialData.id,
        name: data.name,
      })

      if (result.error) {
        throw new Error(result.error.message || "Failed to update company")
      }

      toast("Company updated successfully", {
        description: "Your company name has been updated.",
        action: {
          label: <Check className="h-4 w-4" />,
          onClick: () => console.log("Success"),
        },
      })
      window.location.reload();
    } catch (error) {
      console.error("Error updating company:", error)
      toast("Error updating company", {
        description: error instanceof Error ? error.message : "Please try again later.",
        action: {
          label: <AlertCircle className="h-4 w-4" />,
          onClick: () => console.log("Error"),
        },
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <div className="flex items-center space-x-2">
          <Building2 className="h-5 w-5" />
          <CardTitle className="text-2xl">Company Information</CardTitle>
        </div>
        <CardDescription>
          Update your company details and business information.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            {/* Basic Information */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-medium">Basic Information</h3>
                <Badge variant="outline">Editable</Badge>
              </div>
              
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter company name" 
                        {...field} 
                        className=""
                      />
                    </FormControl>
                    <FormDescription>
                      This is your company's official name.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Address Information */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-medium">Address Information</h3>
                <Badge variant="secondary">Coming Soon</Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Street Address</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Street address" 
                          {...field} 
                          disabled 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="City" 
                          {...field} 
                          disabled 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="postalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postal Code</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Postal code" 
                          {...field} 
                          disabled 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Country" 
                          {...field} 
                          disabled 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Tax Information */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-medium">Tax Information</h3>
                <Badge variant="secondary">Coming Soon</Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="taxNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tax Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Tax number" 
                          {...field} 
                          disabled 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vatNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VAT Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="VAT number" 
                          {...field} 
                          disabled 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Contact Information */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-medium">Contact Information</h3>
                <Badge variant="secondary">Coming Soon</Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="+1 (555) 123-4567" 
                          {...field} 
                          disabled 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="contact@company.com" 
                          {...field} 
                          disabled 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="https://www.company.com" 
                          {...field} 
                          disabled 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end pt-6">
              <Button 
                type="submit" 
                disabled={isLoading}
                className="min-w-[120px] cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}