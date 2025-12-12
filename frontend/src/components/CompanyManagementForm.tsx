"use client";

import React, { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Building2, Save, AlertCircle, Check } from "lucide-react";

// shadcn/ui
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const formSchema = z.object({
  name: z.string().min(2, {
    message: "Company name must be at least 2 characters.",
  }),
  address_street: z.string().optional().nullable(),
  address_city: z.string().optional().nullable(),
  address_zip: z.coerce.string().optional().nullable(),
  address_country: z.string().optional().nullable(),
  vat: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

type FormData = z.infer<typeof formSchema>;

interface CompanyManagementFormProps {
  initialData: {
    id: number
    name: string
    address_street: string | null
    address_city: string | null
    address_zip: string | null
    address_country: string | null
    vat: string | null
    website: string | null
    isActive?: boolean
  }
}

export default function CompanyManagementForm({ initialData }: CompanyManagementFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData.name,
      address_street: initialData.address_street,
      address_city: initialData.address_city,
      address_zip: initialData.address_zip,
      address_country: initialData.address_country,
      vat: initialData.vat,
      website: initialData.website,
      isActive: initialData.isActive,
    },
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const { actions } = await import("astro:actions");

      const result = await actions.updateCompany({
        id: initialData.id,
        name: data.name,
        address_street: data.address_street ?? null,
        address_city: data.address_city ?? null,
        address_zip: data.address_zip ?? null,
        address_country: data.address_country ?? null,
        vat: data.vat ?? null,
        website: data.website ?? null,
        isActive: typeof data.isActive === "boolean" ? data.isActive : undefined,
      });

      if (!result?.data?.success) {
        throw new Error(result?.data?.message || "Failed to update company");
      }

      toast("Company updated successfully", {
        description: "Your company information has been updated.",
        action: {
          label: <Check className="h-4 w-4" />,
          onClick: () => {},
        },
      });
      window.location.reload();
    } catch (error) {
      console.error("Error updating company:", error);
      toast("Error updating company", {
        description: error instanceof Error ? error.message : "Please try again later.",
        action: {
          label: <AlertCircle className="h-4 w-4" />,
          onClick: () => {},
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <div className="flex items-center space-x-2">
          <Building2 className="h-5 w-5" />
          <CardTitle className="text-2xl">Company Information</CardTitle>
        </div>
        <CardDescription>Update your company details and business information.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-medium">Basic Information</h3>
              </div>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter company name" {...field} />
                    </FormControl>
                    <FormDescription>This is your company's official name.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Address */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-medium">Address</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="address_street"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Street & Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Street and number" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address_zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP</FormLabel>
                      <FormControl>
                        <Input placeholder="Postal code" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address_city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="City" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address_country"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input placeholder="Country" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Tax and Web */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-medium">Other Information</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="vat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VAT Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="DE123456789" 
                          {...field} 
                          value={field.value ?? ""} 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input placeholder="https://example.com" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            <div className="flex justify-end pt-6">
              <Button type="submit" disabled={isLoading} className="min-w-[140px] cursor-pointer">
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
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
  );
}
